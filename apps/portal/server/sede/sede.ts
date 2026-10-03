import { hasPermission, requirePermission } from "@ordem/authz";
import {
  SedeActivitySchema,
  SedeDeclarationSchema,
  SedeRollSchema,
  rollSede,
  type SedeActivity,
  type SedeActivityInput,
  type SedeActivityUpdate,
  type SedeDeclaration,
  type SedeDeclareInput,
  type SedeImportResponse,
  type SedeManageResponse,
  type SedeResolveInput,
  type SedeStateResponse,
} from "@ordem/contracts";
import type { AuthenticatedSession } from "@/server/identity/session";
import { enqueueRegistroMessage } from "@/server/integrations/discord-registro";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";
import { BASE_SEDE_ACTIVITIES } from "./base-activities";

type ActivityRow = Readonly<{
  id: string;
  campaign_id: string;
  npc: string;
  name: string;
  description: string;
  effect: string;
  min_level: number;
  input_mode: SedeActivity["inputMode"];
  roll: string | null;
  active: number;
  sort: number;
  version: number;
  created_at: string;
  updated_at: string;
}>;

type DeclarationRow = Readonly<{
  id: string;
  campaign_id: string;
  player_name: string;
  actor_name: string;
  activity_id: string;
  activity_npc: string;
  activity_name: string;
  activity_effect: string;
  note: string | null;
  roll_json: string | null;
  status: SedeDeclaration["status"];
  result: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  period_started_at: string | null;
  registro_thread_id: string | null;
  created_at: string;
}>;

const ACTIVITY_COLUMNS = `id, campaign_id, npc, name, description, effect, min_level, input_mode, roll,
  active, sort, version, created_at, updated_at`;

const DECLARATION_SELECT = `SELECT d.id, d.campaign_id, u.display_name AS player_name, d.actor_name,
    d.activity_id, d.activity_npc, d.activity_name, d.activity_effect, d.note, d.roll_json, d.status,
    d.result, r.display_name AS resolved_by_name, d.resolved_at, d.period_started_at, l.registro_thread_id, d.created_at
  FROM sede_declarations d
  INNER JOIN iam_users u ON u.id = d.user_id
  LEFT JOIN iam_users r ON r.id = d.resolved_by_user_id
  LEFT JOIN campaign_character_links l ON l.campaign_id = d.campaign_id AND l.user_id = d.user_id`;

function mapActivity(row: ActivityRow): SedeActivity {
  return SedeActivitySchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    npc: row.npc,
    name: row.name,
    description: row.description,
    effect: row.effect,
    minLevel: row.min_level,
    inputMode: row.input_mode,
    roll: row.roll,
    active: Boolean(row.active),
    sort: row.sort,
    version: row.version,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

function mapDeclaration(row: DeclarationRow): SedeDeclaration {
  return SedeDeclarationSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    playerName: row.player_name,
    actorName: row.actor_name,
    activity: { id: row.activity_id, npc: row.activity_npc, name: row.activity_name, effect: row.activity_effect },
    note: row.note,
    roll: row.roll_json ? SedeRollSchema.parse(JSON.parse(row.roll_json)) : null,
    status: row.status,
    result: row.result,
    resolvedByName: row.resolved_by_name,
    resolvedAt: toIsoDateTime(row.resolved_at),
    periodStartedAt: toIsoDateTime(row.period_started_at),
    registroLinked: Boolean(row.registro_thread_id),
    createdAt: toIsoDateTime(row.created_at),
  });
}

export function requireSedeManager(session: AuthenticatedSession, campaignId: string): void {
  requirePermission(session.principal, "sede:manage", { kind: "campaign", campaignId });
}

async function assertCampaignExists(campaignId: string): Promise<void> {
  const found = await getD1()
    .prepare("SELECT 1 AS found FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<{ found: number }>();
  if (!found) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
}

export async function sedeLevel(campaignId: string): Promise<number> {
  const row = await getD1()
    .prepare("SELECT level FROM sede_settings WHERE campaign_id = ?")
    .bind(campaignId)
    .first<{ level: number }>();
  return row?.level ?? 1;
}

async function loadActivities(campaignId: string): Promise<SedeActivity[]> {
  const result = await getD1()
    .prepare(
      `SELECT ${ACTIVITY_COLUMNS} FROM sede_activities WHERE campaign_id = ?
       ORDER BY min_level, sort, npc COLLATE NOCASE, name COLLATE NOCASE`,
    )
    .bind(campaignId)
    .all<ActivityRow>();
  return result.results.map(mapActivity);
}

/**
 * Início do período atual do Corvo: a inscrição mais recente numa missão da
 * campanha. Sem inscrição, o período vem desde o começo.
 */
async function periodStart(campaignId: string, userId: string): Promise<string | null> {
  const row = await getD1()
    .prepare(
      `SELECT MAX(s.created_at) AS started_at
       FROM mission_signups s
       INNER JOIN missions m ON m.id = s.mission_id
       WHERE m.campaign_id = ? AND s.user_id = ? AND s.status != 'withdrawn'`,
    )
    .bind(campaignId, userId)
    .first<{ started_at: string | null }>();
  return row?.started_at ?? null;
}

type OwnCharacter = Readonly<{ world_id: string; foundry_actor_id: string; actor_name: string }>;

async function ownCharacter(campaignId: string, userId: string): Promise<OwnCharacter | null> {
  return getD1()
    .prepare(
      `SELECT l.world_id, l.foundry_actor_id, COALESCE(p.name, l.actor_name) AS actor_name
       FROM campaign_character_links l
       INNER JOIN campaign_members cm
         ON cm.campaign_id = l.campaign_id AND cm.user_id = l.user_id AND cm.status = 'active'
       LEFT JOIN foundry_character_projections p
         ON p.campaign_id = l.campaign_id AND p.world_id = l.world_id AND p.foundry_actor_id = l.foundry_actor_id
       WHERE l.campaign_id = ? AND l.user_id = ?`,
    )
    .bind(campaignId, userId)
    .first<OwnCharacter>();
}

async function ownDeclarations(campaignId: string, userId: string): Promise<DeclarationRow[]> {
  const result = await getD1()
    .prepare(`${DECLARATION_SELECT} WHERE d.campaign_id = ? AND d.user_id = ? ORDER BY d.created_at DESC, d.rowid DESC LIMIT 60`)
    .bind(campaignId, userId)
    .all<DeclarationRow>();
  return result.results;
}

const inPeriod = (row: Pick<DeclarationRow, "created_at">, start: string | null) => !start || row.created_at > start;

/** Estado da Vida na Sede para o próprio jogador. */
export async function getSedeState(session: AuthenticatedSession, campaignId: string): Promise<SedeStateResponse> {
  requirePermission(session.principal, "sede:declare", { kind: "campaign", campaignId });
  const [level, activities, character, start, rows] = await Promise.all([
    sedeLevel(campaignId),
    loadActivities(campaignId),
    ownCharacter(campaignId, session.user.id),
    periodStart(campaignId, session.user.id),
    ownDeclarations(campaignId, session.user.id),
  ]);
  const current = rows.filter((row) => row.status !== "cancelled" && inPeriod(row, start));
  const chosen = new Set(current.map((row) => row.activity_id));
  return {
    campaignId,
    level,
    actorName: character?.actor_name ?? null,
    period: {
      startedAt: toIsoDateTime(start),
      allowance: level,
      used: current.length,
      remaining: Math.max(0, level - current.length),
    },
    activities: activities
      .filter((activity) => activity.active && activity.minLevel <= level)
      .map((activity) => ({ ...activity, chosenThisPeriod: chosen.has(activity.id) })),
    current: current.map(mapDeclaration),
    history: rows.filter((row) => row.status !== "cancelled" && !inPeriod(row, start)).slice(0, 30).map(mapDeclaration),
  };
}

/** Rolagem com números aleatórios criptográficos. */
function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! / 2 ** 32;
}

export async function declareSedeActivity(
  session: AuthenticatedSession,
  campaignId: string,
  input: SedeDeclareInput,
  correlationId: string,
): Promise<SedeDeclaration> {
  requirePermission(session.principal, "sede:declare", { kind: "campaign", campaignId });
  const character = await ownCharacter(campaignId, session.user.id);
  if (!character) {
    throw new HttpError(409, "character_link_missing", "Peça a um mestre para vincular seu personagem antes de escolher atividades.");
  }
  const [level, start, rows] = await Promise.all([
    sedeLevel(campaignId),
    periodStart(campaignId, session.user.id),
    ownDeclarations(campaignId, session.user.id),
  ]);
  const activity = (await loadActivities(campaignId)).find((candidate) => candidate.id === input.activityId);
  if (!activity || !activity.active || activity.minLevel > level) {
    throw new HttpError(409, "sede_activity_unavailable", "Esta atividade não está disponível no nível atual da Sede.");
  }
  const current = rows.filter((row) => row.status !== "cancelled" && inPeriod(row, start));
  if (current.length >= level) {
    throw new HttpError(
      409,
      "sede_allowance_used",
      level === 1
        ? "Você já escolheu a atividade deste período. A próxima abre depois da sua inscrição numa missão."
        : `Você já escolheu as ${level} atividades deste período. As próximas abrem depois da sua inscrição numa missão.`,
    );
  }
  if (current.some((row) => row.activity_id === activity.id)) {
    throw new HttpError(409, "sede_activity_repeated", "Você já escolheu esta atividade neste período.");
  }
  const note = input.note?.trim() || null;
  if (activity.inputMode === "question" && !note) {
    throw new HttpError(422, "sede_question_required", "Escreva a pergunta que o Corvo quer investigar.");
  }
  const roll = activity.roll ? rollSede(activity.roll, cryptoRandom) : null;

  const id = crypto.randomUUID();
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `INSERT INTO sede_declarations (
           id, campaign_id, user_id, world_id, foundry_actor_id, actor_name, activity_id, activity_npc,
           activity_name, activity_effect, note, roll_json, period_started_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        campaignId,
        session.user.id,
        character.world_id,
        character.foundry_actor_id,
        character.actor_name,
        activity.id,
        activity.npc,
        activity.name,
        activity.effect,
        activity.inputMode === "none" ? null : note,
        roll ? JSON.stringify(roll) : null,
        start,
      ),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "sede.activity.declared",
      entityType: "sede_declaration",
      entityId: id,
      correlationId,
      details: { activity: `${activity.npc} — ${activity.name}`, roll: roll?.total ?? null },
    }),
  ]);
  const saved = await findDeclarationRow(campaignId, id);
  publishToRegistro(saved, "declared", correlationId);
  return mapDeclaration(saved);
}

async function findDeclarationRow(campaignId: string, declarationId: string): Promise<DeclarationRow> {
  const row = await getD1()
    .prepare(`${DECLARATION_SELECT} WHERE d.id = ? AND d.campaign_id = ?`)
    .bind(declarationId, campaignId)
    .first<DeclarationRow>();
  if (!row) throw new HttpError(404, "sede_declaration_not_found", "Atividade não encontrada.");
  return row;
}

async function requiredDeclaration(campaignId: string, declarationId: string): Promise<SedeDeclaration> {
  return mapDeclaration(await findDeclarationRow(campaignId, declarationId));
}

/** Texto da mensagem no tópico do Corvo, sem menções. */
export function registroContent(event: "declared" | "resolved" | "cancelled", declaration: SedeDeclaration): string {
  const activity = `${declaration.activity.npc} — ${declaration.activity.name}`;
  if (event === "resolved") {
    return [`✅ **Vida na Sede** · Resultado de **${activity}** (${declaration.actorName})`, declaration.result ?? ""]
      .filter(Boolean)
      .join("\n");
  }
  if (event === "cancelled") {
    return `↩️ **Vida na Sede** · A escolha de **${activity}** (${declaration.actorName}) foi desfeita.`;
  }
  return [
    `🪶 **Vida na Sede** · ${declaration.actorName} escolheu **${activity}**`,
    `> ${declaration.activity.effect}`,
    declaration.note ? `**Pedido:** ${declaration.note}` : null,
    declaration.roll
      ? `**Rolagem ${declaration.roll.formula}:** ${declaration.roll.dice.join(" + ")} = **${declaration.roll.total}**`
      : null,
    "_Aguardando o Guardião._",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Publica no tópico do Corvo, quando ele estiver ligado ao vínculo do personagem. */
function publishToRegistro(
  row: DeclarationRow,
  event: "declared" | "resolved" | "cancelled",
  correlationId: string,
): void {
  if (!row.registro_thread_id) return;
  enqueueRegistroMessage({
    campaignId: row.campaign_id,
    threadId: row.registro_thread_id,
    content: registroContent(event, mapDeclaration(row)),
    correlationId,
    reference: { kind: "sede_declaration", id: row.id, event },
  });
}

/**
 * Desfaz uma escolha ainda não resolvida. O jogador só desfaz as próprias, do
 * período atual; o mestre pode descartar qualquer uma.
 */
export async function cancelSedeDeclaration(
  session: AuthenticatedSession,
  campaignId: string,
  declarationId: string,
  correlationId: string,
): Promise<SedeDeclaration> {
  const row = await getD1()
    .prepare("SELECT user_id, status, created_at FROM sede_declarations WHERE id = ? AND campaign_id = ?")
    .bind(declarationId, campaignId)
    .first<{ user_id: string; status: string; created_at: string }>();
  if (!row) throw new HttpError(404, "sede_declaration_not_found", "Atividade não encontrada.");
  const manager = hasPermission(session.principal, "sede:manage", { kind: "campaign", campaignId });
  if (!manager) {
    requirePermission(session.principal, "sede:declare", { kind: "campaign", campaignId });
    if (row.user_id !== session.user.id) {
      throw new HttpError(404, "sede_declaration_not_found", "Atividade não encontrada.");
    }
    if (!inPeriod(row, await periodStart(campaignId, session.user.id))) {
      throw new HttpError(409, "sede_period_closed", "Este período já foi encerrado com a sua inscrição numa missão.");
    }
  }
  if (row.status !== "declared") {
    throw new HttpError(409, "sede_declaration_closed", "Só dá para desfazer atividades que ainda não foram resolvidas.");
  }
  const db = getD1();
  await db.batch([
    db
      .prepare(
        "UPDATE sede_declarations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'declared'",
      )
      .bind(declarationId),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "sede.activity.cancelled",
      entityType: "sede_declaration",
      entityId: declarationId,
      correlationId,
      details: { byManager: manager && row.user_id !== session.user.id },
    }),
  ]);
  const saved = await findDeclarationRow(campaignId, declarationId);
  publishToRegistro(saved, "cancelled", correlationId);
  return mapDeclaration(saved);
}

/* ------------------------------------------------------------------ */
/* Painel do Guardião                                                  */
/* ------------------------------------------------------------------ */

export async function getSedeManagement(
  session: AuthenticatedSession,
  campaignId: string,
): Promise<SedeManageResponse> {
  requireSedeManager(session, campaignId);
  const db = getD1();
  const [level, activities, pending, resolved] = await Promise.all([
    sedeLevel(campaignId),
    loadActivities(campaignId),
    db
      .prepare(`${DECLARATION_SELECT} WHERE d.campaign_id = ? AND d.status = 'declared' ORDER BY d.created_at, d.rowid`)
      .bind(campaignId)
      .all<DeclarationRow>(),
    db
      .prepare(
        `${DECLARATION_SELECT} WHERE d.campaign_id = ? AND d.status = 'resolved' ORDER BY d.resolved_at DESC, d.rowid DESC LIMIT 60`,
      )
      .bind(campaignId)
      .all<DeclarationRow>(),
  ]);
  return {
    level,
    activities,
    pending: pending.results.map(mapDeclaration),
    resolved: resolved.results.map(mapDeclaration),
  };
}

export async function setSedeLevel(
  session: AuthenticatedSession,
  campaignId: string,
  level: number,
  correlationId: string,
): Promise<number> {
  requireSedeManager(session, campaignId);
  await assertCampaignExists(campaignId);
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `INSERT INTO sede_settings (campaign_id, level) VALUES (?, ?)
         ON CONFLICT(campaign_id) DO UPDATE SET level = excluded.level, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(campaignId, level),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "sede.level.updated",
      entityType: "campaign",
      entityId: campaignId,
      correlationId,
      details: { level },
    }),
  ]);
  return level;
}

/** Registra o resultado (ou corrige um já registrado). */
export async function resolveSedeDeclaration(
  session: AuthenticatedSession,
  campaignId: string,
  declarationId: string,
  input: SedeResolveInput,
  correlationId: string,
): Promise<SedeDeclaration> {
  requireSedeManager(session, campaignId);
  const current = await requiredDeclaration(campaignId, declarationId);
  if (current.status === "cancelled") {
    throw new HttpError(409, "sede_declaration_closed", "Esta atividade foi desfeita e não pode ser resolvida.");
  }
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE sede_declarations
         SET status = 'resolved', result = ?, resolved_by_user_id = ?,
             resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('declared', 'resolved')`,
      )
      .bind(input.result, session.user.id, declarationId),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: current.status === "resolved" ? "sede.activity.result_updated" : "sede.activity.resolved",
      entityType: "sede_declaration",
      entityId: declarationId,
      correlationId,
      details: { activity: `${current.activity.npc} — ${current.activity.name}`, actorName: current.actorName },
    }),
  ]);
  const saved = await findDeclarationRow(campaignId, declarationId);
  publishToRegistro(saved, "resolved", correlationId);
  return mapDeclaration(saved);
}

async function requiredActivity(campaignId: string, activityId: string): Promise<SedeActivity> {
  const row = await getD1()
    .prepare(`SELECT ${ACTIVITY_COLUMNS} FROM sede_activities WHERE id = ? AND campaign_id = ?`)
    .bind(activityId, campaignId)
    .first<ActivityRow>();
  if (!row) throw new HttpError(404, "sede_activity_not_found", "Atividade não encontrada.");
  return mapActivity(row);
}

async function assertUniqueName(campaignId: string, npc: string, name: string, exceptId: string | null) {
  const found = await getD1()
    .prepare(
      `SELECT id FROM sede_activities
       WHERE campaign_id = ? AND npc = ? COLLATE NOCASE AND name = ? COLLATE NOCASE AND id != ?`,
    )
    .bind(campaignId, npc, name, exceptId ?? "")
    .first<{ id: string }>();
  if (found) throw new HttpError(409, "sede_activity_duplicate", "Já existe uma atividade com esse nome para esse NPC.");
}

export async function createSedeActivity(
  session: AuthenticatedSession,
  campaignId: string,
  input: SedeActivityInput,
  correlationId: string,
): Promise<SedeActivity> {
  requireSedeManager(session, campaignId);
  await assertCampaignExists(campaignId);
  await assertUniqueName(campaignId, input.npc, input.name, null);
  const id = crypto.randomUUID();
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `INSERT INTO sede_activities (id, campaign_id, npc, name, description, effect, min_level, input_mode, roll, active, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        campaignId,
        input.npc,
        input.name,
        input.description,
        input.effect,
        input.minLevel,
        input.inputMode,
        input.roll,
        input.active ? 1 : 0,
        input.sort,
      ),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "sede.activity_type.created",
      entityType: "sede_activity",
      entityId: id,
      correlationId,
      details: { npc: input.npc, name: input.name },
    }),
  ]);
  return requiredActivity(campaignId, id);
}

export async function updateSedeActivity(
  session: AuthenticatedSession,
  campaignId: string,
  activityId: string,
  input: SedeActivityUpdate,
  correlationId: string,
): Promise<SedeActivity> {
  requireSedeManager(session, campaignId);
  const current = await requiredActivity(campaignId, activityId);
  if (current.version !== input.version) {
    throw new HttpError(409, "version_conflict", "Esta atividade foi alterada em outro lugar. Recarregue para ver a versão atual.");
  }
  await assertUniqueName(campaignId, input.npc, input.name, activityId);
  const db = getD1();
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE sede_activities
         SET npc = ?, name = ?, description = ?, effect = ?, min_level = ?, input_mode = ?, roll = ?, active = ?,
             sort = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(
        input.npc,
        input.name,
        input.description,
        input.effect,
        input.minLevel,
        input.inputMode,
        input.roll,
        input.active ? 1 : 0,
        input.sort,
        activityId,
        input.version,
      ),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "sede.activity_type.updated",
      entityType: "sede_activity",
      entityId: activityId,
      correlationId,
      details: { npc: input.npc, name: input.name, active: input.active },
    }),
  ]);
  if (!update?.meta.changes) {
    throw new HttpError(409, "version_conflict", "Esta atividade foi alterada em outro lugar. Recarregue para ver a versão atual.");
  }
  return requiredActivity(campaignId, activityId);
}

/** Importa as atividades do nível 1 do texto da campanha, sem duplicar. */
export async function importBaseSedeActivities(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<SedeImportResponse> {
  requireSedeManager(session, campaignId);
  await assertCampaignExists(campaignId);
  const db = getD1();
  const results = await db.batch([
    ...BASE_SEDE_ACTIVITIES.map((activity) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO sede_activities (id, campaign_id, npc, name, description, effect, min_level, input_mode, roll, active, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          campaignId,
          activity.npc,
          activity.name,
          activity.description,
          activity.effect,
          activity.minLevel,
          activity.inputMode,
          activity.roll,
          activity.active ? 1 : 0,
          activity.sort,
        ),
    ),
  ]);
  const created = results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
  await prepareAudit(db, {
    actorUserId: session.user.id,
    campaignId,
    action: "sede.activity_type.imported",
    entityType: "campaign",
    entityId: campaignId,
    correlationId,
    details: { created },
  }).run();
  return { created, skipped: BASE_SEDE_ACTIVITIES.length - created };
}
