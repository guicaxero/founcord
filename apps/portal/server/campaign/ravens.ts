import { hasPermission, requirePermission } from "@ordem/authz";
import {
  RavenDetailSchema,
  RavenManagementSchema,
  mediaUrl,
  ravenAttributeKeys,
  ravenStatKeys,
  type CreateRavenInput,
  type MissionOutcome,
  type RavenAttributes,
  type RavenDetail,
  type RavenManagement,
  type RavenManagementListResponse,
  type RavenMissionRef,
  type RavenOverrides,
  type RavenStats,
  type RavenStatus,
  type RavenSummary,
  type UpdateRavenInput,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import { prepareAudit, prepareAuditAfterChange } from "@/server/shared/audit";
import type { AuthenticatedSession } from "@/server/identity/session";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";
import { assertCampaignMedia } from "@/server/media/media";
import { requireCampaignVisible } from "./campaigns";

/**
 * Junções que dão ao Corvo o que vem do Foundry (projeção) e o nome do
 * vínculo, usado quando o ator sumiu da sincronização.
 */
export const RAVEN_JOINS = `
  LEFT JOIN foundry_character_projections p
    ON p.campaign_id = r.campaign_id AND p.world_id = r.world_id AND p.foundry_actor_id = r.foundry_actor_id
  LEFT JOIN campaign_character_links l
    ON l.campaign_id = r.campaign_id AND l.world_id = r.world_id AND l.foundry_actor_id = r.foundry_actor_id`;

/** Nome exibido: correção, Foundry, vínculo ou um rótulo neutro. */
export const RAVEN_NAME_SQL = "COALESCE(r.name, p.name, l.actor_name, 'Corvo sem nome')";

type RavenRow = Readonly<{
  id: string;
  campaign_id: string;
  user_id: string | null;
  world_id: string | null;
  foundry_actor_id: string | null;
  status: RavenStatus;
  listed: number;
  image_media_id: string | null;
  name: string | null;
  player_name: string | null;
  ancestry: string | null;
  novice_path: string | null;
  expert_path: string | null;
  master_path: string | null;
  level: number | null;
  sessions_played: number | null;
  missions_completed: number | null;
  missions_failed: number | null;
  last_mission: string | null;
  activities: string | null;
  attributes_json: string | null;
  stats_json: string | null;
  version: number;
  updated_at: string;
  user_name: string | null;
  link_actor_name: string | null;
  p_name: string | null;
  p_level: number | null;
  p_ancestry: string | null;
  p_novice: string | null;
  p_expert: string | null;
  p_master: string | null;
  p_health: number | null;
  p_healing: number | null;
  p_insanity: number | null;
  p_corruption: number | null;
  p_attributes: string | null;
  p_characteristics: string | null;
  p_has_image: number | null;
  p_updated_at: string | null;
  auto_completed: number;
  auto_failed: number;
  auto_sessions: number;
}>;

const RAVEN_SELECT = `
  SELECT r.*, u.display_name AS user_name, l.actor_name AS link_actor_name,
    p.name AS p_name, p.level AS p_level, p.ancestry AS p_ancestry,
    p.novice_path AS p_novice, p.expert_path AS p_expert, p.master_path AS p_master,
    p.health_max AS p_health, p.healing_rate AS p_healing,
    p.insanity AS p_insanity, p.corruption AS p_corruption,
    json_extract(p.sheet_json, '$.attributes') AS p_attributes,
    json_extract(p.sheet_json, '$.characteristics') AS p_characteristics,
    (p.portrait_url IS NOT NULL OR p.token_url IS NOT NULL) AS p_has_image,
    p.source_updated_at AS p_updated_at,
    (SELECT COUNT(*) FROM mission_participants mp JOIN missions m ON m.id = mp.mission_id
      WHERE mp.raven_id = r.id AND m.status = 'published' AND m.outcome = 'completed') AS auto_completed,
    (SELECT COUNT(*) FROM mission_participants mp JOIN missions m ON m.id = mp.mission_id
      WHERE mp.raven_id = r.id AND m.status = 'published' AND m.outcome = 'failed') AS auto_failed,
    (SELECT COUNT(*) FROM campaign_sessions cs
      WHERE cs.status = 'ended' AND cs.mission_id IN (
        SELECT mp.mission_id FROM mission_participants mp WHERE mp.raven_id = r.id
      )) AS auto_sessions
  FROM ravens r
  LEFT JOIN iam_users u ON u.id = r.user_id
  ${RAVEN_JOINS}`;

type Extras = Readonly<{
  missions: ReadonlyMap<string, RavenMissionRef[]>;
  activities: ReadonlyMap<string, string[]>;
}>;

const MAX_ACTIVITIES = 8;

// ---------------------------------------------------------------- leitura

export async function listRavens(
  campaignId: string,
  session: AuthenticatedSession | null,
): Promise<RavenSummary[]> {
  await requireCampaignVisible(campaignId, session);
  const rows = await getD1()
    .prepare(`${RAVEN_SELECT} WHERE r.campaign_id = ? AND r.listed = 1`)
    .bind(campaignId)
    .all<RavenRow>();
  return rows.results
    .map((row) => toSummary(row))
    .sort((left, right) => statusOrder[left.status] - statusOrder[right.status] || left.name.localeCompare(right.name, "pt-BR"));
}

export async function getRaven(ravenId: string, session: AuthenticatedSession | null): Promise<RavenDetail> {
  const row = await findRavenRow(ravenId);
  await requireCampaignVisible(row.campaign_id, session);
  if (!row.listed && !canManageRavens(session, row.campaign_id)) {
    throw new HttpError(404, "raven_not_found", "Corvo não encontrado no registro.");
  }
  const extras = await loadExtras(row.campaign_id);
  return RavenDetailSchema.parse(toDetail(row, extras));
}

/** Imagem do Corvo: a enviada ao portal ou o retrato/token do Foundry. */
export async function getRavenImage(
  ravenId: string,
  session: AuthenticatedSession | null,
): Promise<{ kind: "redirect"; location: string } | { kind: "bytes"; contentType: string; body: Uint8Array<ArrayBuffer> } | null> {
  const row = await getD1()
    .prepare(
      `SELECT r.campaign_id, r.listed, r.image_media_id, p.portrait_url, p.token_url
       FROM ravens r ${RAVEN_JOINS} WHERE r.id = ?`,
    )
    .bind(ravenId)
    .first<{
      campaign_id: string;
      listed: number;
      image_media_id: string | null;
      portrait_url: string | null;
      token_url: string | null;
    }>();
  if (!row) return null;
  await requireCampaignVisible(row.campaign_id, session);
  if (!row.listed && !canManageRavens(session, row.campaign_id)) return null;
  if (row.image_media_id) return { kind: "redirect", location: mediaUrl(row.image_media_id) };
  const source = row.portrait_url ?? row.token_url;
  if (!source) return null;
  const data = /^data:(image\/(?:webp|png|jpeg));base64,(.+)$/u.exec(source);
  if (data) {
    const binary = atob(data[2]!);
    const body = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) body[index] = binary.charCodeAt(index);
    return { kind: "bytes", contentType: data[1]!, body };
  }
  return source.startsWith("https://") ? { kind: "redirect", location: source } : null;
}

export async function listRavenManagement(
  session: AuthenticatedSession,
  campaignId: string,
): Promise<RavenManagementListResponse> {
  requireRavenManager(session, campaignId);
  const db = getD1();
  const [rows, members, extras] = await Promise.all([
    db.prepare(`${RAVEN_SELECT} WHERE r.campaign_id = ?`).bind(campaignId).all<RavenRow>(),
    db
      .prepare(
        `SELECT cm.user_id, u.display_name FROM campaign_members cm
         JOIN iam_users u ON u.id = cm.user_id
         WHERE cm.campaign_id = ? AND cm.status = 'active'
         ORDER BY u.display_name COLLATE NOCASE`,
      )
      .bind(campaignId)
      .all<{ user_id: string; display_name: string }>(),
    loadExtras(campaignId),
  ]);
  return {
    data: rows.results
      .map((row) => toManagement(row, extras))
      .sort((left, right) => left.effective.name.localeCompare(right.effective.name, "pt-BR")),
    members: members.results.map((member) => ({ userId: member.user_id, displayName: member.display_name })),
  };
}

// ---------------------------------------------------------------- escrita

export async function createRaven(
  session: AuthenticatedSession,
  input: CreateRavenInput,
  correlationId: string,
): Promise<RavenManagement> {
  requireRavenManager(session, input.campaignId);
  await assertRavenReferences(input.campaignId, input.userId, input.imageMediaId);
  const db = getD1();
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO ravens (id, campaign_id, user_id, status, listed, image_media_id, ${OVERRIDE_COLUMNS.join(", ")})
         VALUES (?, ?, ?, ?, ?, ?, ${OVERRIDE_COLUMNS.map(() => "?").join(", ")})`,
      )
      .bind(id, input.campaignId, input.userId, input.status, input.listed ? 1 : 0, input.imageMediaId, ...overrideValues(input.overrides)),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId: input.campaignId,
      action: "raven.created",
      entityType: "raven",
      entityId: id,
      correlationId,
      details: { name: input.overrides.name },
    }),
  ]);
  return getRavenManagement(id);
}

export async function updateRaven(
  session: AuthenticatedSession,
  ravenId: string,
  input: UpdateRavenInput,
  correlationId: string,
): Promise<RavenManagement> {
  const existing = await findRavenRow(ravenId);
  requireRavenManager(session, existing.campaign_id);
  if (!existing.world_id && input.overrides.name === null) {
    throw new HttpError(422, "raven_name_required", "Corvos sem personagem no Foundry precisam de nome.");
  }
  await assertRavenReferences(existing.campaign_id, input.userId, input.imageMediaId);
  const db = getD1();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE ravens SET user_id = ?, status = ?, listed = ?, image_media_id = ?,
           ${OVERRIDE_COLUMNS.map((column) => `${column} = ?`).join(", ")},
           version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(
        input.userId,
        input.status,
        input.listed ? 1 : 0,
        input.imageMediaId,
        ...overrideValues(input.overrides),
        ravenId,
        input.version,
      ),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: existing.campaign_id,
      action: "raven.updated",
      entityType: "raven",
      entityId: ravenId,
      correlationId,
      details: { status: input.status, listed: input.listed },
    }),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) {
    throw new HttpError(409, "version_conflict", "O Corvo foi alterado por outra pessoa. Abra de novo para ver a versão atual.");
  }
  return getRavenManagement(ravenId);
}

/** Troca os Corvos que participaram da missão. O registro é público: exige publicar missões. */
export async function setMissionParticipants(
  session: AuthenticatedSession,
  missionId: string,
  ravenIds: readonly string[],
  correlationId: string,
): Promise<void> {
  const mission = await getD1()
    .prepare("SELECT campaign_id, status FROM missions WHERE id = ?")
    .bind(missionId)
    .first<{ campaign_id: string; status: string }>();
  if (!mission) throw new HttpError(404, "mission_not_found", "Missão não encontrada.");
  requirePermission(session.principal, "mission:publish", { kind: "campaign", campaignId: mission.campaign_id });
  if (mission.status !== "published") {
    throw new HttpError(409, "mission_not_published", "Publique a missão antes de registrá-la.");
  }
  const unique = [...new Set(ravenIds)];
  if (unique.length > 0) {
    const found = await getD1()
      .prepare(`SELECT COUNT(*) AS total FROM ravens WHERE campaign_id = ? AND id IN (${unique.map(() => "?").join(", ")})`)
      .bind(mission.campaign_id, ...unique)
      .first<{ total: number }>();
    if ((found?.total ?? 0) !== unique.length) {
      throw new HttpError(422, "raven_not_found", "Um dos Corvos não pertence a esta campanha.");
    }
  }
  const db = getD1();
  await db.batch([
    db.prepare("DELETE FROM mission_participants WHERE mission_id = ?").bind(missionId),
    ...unique.map((ravenId) =>
      db.prepare("INSERT INTO mission_participants (mission_id, raven_id) VALUES (?, ?)").bind(missionId, ravenId),
    ),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId: mission.campaign_id,
      action: "mission.participants_set",
      entityType: "mission",
      entityId: missionId,
      correlationId,
      details: { ravenIds: unique },
    }),
  ]);
}

/** Garante o Corvo do personagem recém-vinculado (vai no mesmo lote do vínculo). */
export function prepareRavenForLink(
  db: D1Database,
  campaignId: string,
  userId: string,
  worldId: string,
  actorId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO ravens (id, campaign_id, user_id, world_id, foundry_actor_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(campaign_id, world_id, foundry_actor_id) DO UPDATE SET
         user_id = excluded.user_id, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(crypto.randomUUID(), campaignId, userId, worldId, actorId);
}

/** Participantes por missão, para o registro público e o painel. */
export async function participantsByMission(
  campaignId: string,
  includeUnlisted: boolean,
): Promise<Map<string, { id: string; name: string; listed: boolean }[]>> {
  const rows = await getD1()
    .prepare(
      `SELECT mp.mission_id, r.id, ${RAVEN_NAME_SQL} AS name, r.listed
       FROM mission_participants mp
       JOIN ravens r ON r.id = mp.raven_id
       ${RAVEN_JOINS}
       WHERE r.campaign_id = ? AND (r.listed = 1 OR ? = 1)
       ORDER BY name COLLATE NOCASE`,
    )
    .bind(campaignId, includeUnlisted ? 1 : 0)
    .all<{ mission_id: string; id: string; name: string; listed: number }>();
  const byMission = new Map<string, { id: string; name: string; listed: boolean }[]>();
  for (const row of rows.results) {
    const list = byMission.get(row.mission_id) ?? [];
    list.push({ id: row.id, name: row.name, listed: Boolean(row.listed) });
    byMission.set(row.mission_id, list);
  }
  return byMission;
}

export function canManageRavens(session: AuthenticatedSession | null, campaignId: string): boolean {
  return Boolean(session && hasPermission(session.principal, "character:link:manage", { kind: "campaign", campaignId }));
}

// ---------------------------------------------------------------- apoio

const statusOrder: Readonly<Record<RavenStatus, number>> = { active: 0, retired: 1, dead: 2 };

const OVERRIDE_COLUMNS = [
  "name",
  "player_name",
  "ancestry",
  "novice_path",
  "expert_path",
  "master_path",
  "level",
  "sessions_played",
  "missions_completed",
  "missions_failed",
  "last_mission",
  "activities",
  "attributes_json",
  "stats_json",
] as const;

function overrideValues(overrides: RavenOverrides): (string | number | null)[] {
  const compact = (values: Record<string, number | null>) =>
    Object.values(values).some((value) => value !== null) ? JSON.stringify(values) : null;
  return [
    overrides.name,
    overrides.playerName,
    overrides.ancestry,
    overrides.novicePath,
    overrides.expertPath,
    overrides.masterPath,
    overrides.level,
    overrides.sessionsPlayed,
    overrides.missionsCompleted,
    overrides.missionsFailed,
    overrides.lastMission,
    overrides.activities || null,
    compact(overrides.attributes),
    compact(overrides.stats),
  ];
}

function requireRavenManager(session: AuthenticatedSession, campaignId: string): void {
  requirePermission(session.principal, "character:link:manage", { kind: "campaign", campaignId });
}

async function assertRavenReferences(campaignId: string, userId: string | null, imageMediaId: string | null) {
  if (userId) {
    const member = await getD1()
      .prepare("SELECT 1 AS found FROM campaign_members WHERE campaign_id = ? AND user_id = ?")
      .bind(campaignId, userId)
      .first<{ found: number }>();
    if (!member) throw new HttpError(422, "member_not_found", "Esse jogador não participa da campanha.");
  }
  await assertCampaignMedia(campaignId, imageMediaId ? [imageMediaId] : []);
}

async function findRavenRow(ravenId: string): Promise<RavenRow> {
  const row = await getD1().prepare(`${RAVEN_SELECT} WHERE r.id = ?`).bind(ravenId).first<RavenRow>();
  if (!row) throw new HttpError(404, "raven_not_found", "Corvo não encontrado no registro.");
  return row;
}

async function getRavenManagement(ravenId: string): Promise<RavenManagement> {
  const row = await findRavenRow(ravenId);
  return toManagement(row, await loadExtras(row.campaign_id));
}

/** Missões e atividades da Sede de todos os Corvos da campanha, em duas consultas. */
async function loadExtras(campaignId: string): Promise<Extras> {
  const db = getD1();
  const [missions, activities] = await Promise.all([
    db
      .prepare(
        `SELECT mp.raven_id, m.id, m.title, m.number, m.outcome
         FROM mission_participants mp
         JOIN missions m ON m.id = mp.mission_id
         WHERE m.campaign_id = ? AND m.status = 'published'
         ORDER BY COALESCE(m.recorded_at, m.published_at) DESC, m.number DESC`,
      )
      .bind(campaignId)
      .all<{ raven_id: string; id: string; title: string; number: number | null; outcome: MissionOutcome | null }>(),
    db
      .prepare(
        `SELECT r.id AS raven_id, d.activity_npc, d.activity_name
         FROM sede_declarations d
         JOIN ravens r ON r.campaign_id = d.campaign_id AND r.world_id = d.world_id AND r.foundry_actor_id = d.foundry_actor_id
         WHERE d.campaign_id = ? AND d.status = 'resolved'
         ORDER BY d.resolved_at DESC`,
      )
      .bind(campaignId)
      .all<{ raven_id: string; activity_npc: string; activity_name: string }>(),
  ]);
  const missionMap = new Map<string, RavenMissionRef[]>();
  for (const row of missions.results) {
    const list = missionMap.get(row.raven_id) ?? [];
    list.push({ id: row.id, title: row.title, number: row.number, outcome: row.outcome });
    missionMap.set(row.raven_id, list);
  }
  const activityMap = new Map<string, string[]>();
  for (const row of activities.results) {
    const list = activityMap.get(row.raven_id) ?? [];
    const label = `${row.activity_npc} - ${row.activity_name}`;
    if (!list.includes(label) && list.length < MAX_ACTIVITIES) list.push(label);
    activityMap.set(row.raven_id, list);
  }
  return { missions: missionMap, activities: activityMap };
}

function parseNumbers(json: string | null): Record<string, number | null> {
  if (!json) return {};
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, typeof entry === "number" && Number.isFinite(entry) ? Math.round(entry) : null]),
    );
  } catch {
    return {};
  }
}

function pick<K extends string>(keys: readonly K[], source: Record<string, number | null>): Record<K, number | null> {
  return Object.fromEntries(keys.map((key) => [key, clampStat(source[key])])) as Record<K, number | null>;
}

function clampStat(value: number | null | undefined): number | null {
  return typeof value === "number" ? Math.max(0, Math.min(999, value)) : null;
}

function automaticOf(row: RavenRow, extras: Extras) {
  const sheetAttributes = parseNumbers(row.p_attributes);
  const characteristics = parseNumbers(row.p_characteristics);
  const hasProjection = row.p_name !== null;
  const attributes: RavenAttributes = pick(ravenAttributeKeys, sheetAttributes);
  const stats: RavenStats = pick(ravenStatKeys, {
    health: hasProjection ? row.p_health : null,
    healingRate: hasProjection ? row.p_healing : null,
    insanity: hasProjection ? row.p_insanity : null,
    corruption: hasProjection ? row.p_corruption : null,
    defense: characteristics.defense ?? null,
    speed: characteristics.speed ?? null,
    power: characteristics.power ?? null,
  });
  const missions = extras.missions.get(row.id) ?? [];
  return {
    name: row.p_name ?? row.link_actor_name,
    playerName: row.user_name,
    ancestry: row.p_ancestry,
    paths: { novice: row.p_novice, expert: row.p_expert, master: row.p_master },
    level: row.p_level,
    sessionsPlayed: Number(row.auto_sessions),
    missionsCompleted: Number(row.auto_completed),
    missionsFailed: Number(row.auto_failed),
    lastMission: missions[0] ?? null,
    activities: extras.activities.get(row.id) ?? [],
    attributes,
    stats,
    hasPortrait: Boolean(row.p_has_image),
  };
}

function overridesOf(row: RavenRow): RavenOverrides {
  return {
    name: row.name,
    playerName: row.player_name,
    ancestry: row.ancestry,
    novicePath: row.novice_path,
    expertPath: row.expert_path,
    masterPath: row.master_path,
    level: row.level,
    sessionsPlayed: row.sessions_played,
    missionsCompleted: row.missions_completed,
    missionsFailed: row.missions_failed,
    lastMission: row.last_mission,
    activities: row.activities,
    attributes: pick(ravenAttributeKeys, parseNumbers(row.attributes_json)),
    stats: pick(ravenStatKeys, parseNumbers(row.stats_json)),
  };
}

function imageUrlOf(row: RavenRow): string | null {
  if (row.image_media_id) return mediaUrl(row.image_media_id);
  if (!row.p_has_image) return null;
  // A versão muda o endereço quando o Foundry manda um retrato novo.
  return `/api/ravens/${row.id}/image?v=${encodeURIComponent(row.p_updated_at ?? "")}`;
}

function toSummary(row: RavenRow): RavenSummary {
  const overrides = overridesOf(row);
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: overrides.name ?? row.p_name ?? row.link_actor_name ?? "Corvo sem nome",
    status: row.status,
    imageUrl: imageUrlOf(row),
    playerName: overrides.playerName ?? row.user_name,
    ancestry: overrides.ancestry ?? row.p_ancestry,
    paths: {
      novice: overrides.novicePath ?? row.p_novice,
      expert: overrides.expertPath ?? row.p_expert,
      master: overrides.masterPath ?? row.p_master,
    },
    level: overrides.level ?? row.p_level,
    sessionsPlayed: overrides.sessionsPlayed ?? Number(row.auto_sessions),
    missionsCompleted: overrides.missionsCompleted ?? Number(row.auto_completed),
    missionsFailed: overrides.missionsFailed ?? Number(row.auto_failed),
    source: row.world_id ? "foundry" : "manual",
  };
}

function toDetail(row: RavenRow, extras: Extras): RavenDetail {
  const overrides = overridesOf(row);
  const automatic = automaticOf(row, extras);
  const merge = <K extends string>(manual: Record<K, number | null>, auto: Record<K, number | null>) =>
    Object.fromEntries(Object.keys(auto).map((key) => [key, manual[key as K] ?? auto[key as K]])) as Record<K, number | null>;
  const activities = overrides.activities
    ? overrides.activities.split(/\n|;/u).map((entry) => entry.trim()).filter(Boolean)
    : automatic.activities;
  return {
    ...toSummary(row),
    lastMission: overrides.lastMission ? { label: overrides.lastMission } : automatic.lastMission,
    activities,
    attributes: merge(overrides.attributes, automatic.attributes),
    stats: merge(overrides.stats, automatic.stats),
    missions: extras.missions.get(row.id) ?? [],
  };
}

function toManagement(row: RavenRow, extras: Extras): RavenManagement {
  return RavenManagementSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    listed: Boolean(row.listed),
    status: row.status,
    userId: row.user_id,
    imageMediaId: row.image_media_id,
    foundry: row.world_id && row.foundry_actor_id ? { worldId: row.world_id, actorId: row.foundry_actor_id } : null,
    overrides: overridesOf(row),
    automatic: automaticOf(row, extras),
    effective: toDetail(row, extras),
    version: row.version,
    updatedAt: toIsoDateTime(row.updated_at)!,
  });
}
