import { requirePermission } from "@ordem/authz";
import {
  CharacterNotesUpdateSchema,
  CharacterSheetSchema,
  PlayerCharacterSheetResponseSchema,
  type CharacterNotesDeliveryCallback,
  type CharacterNotesUpdate,
  type CharacterNotesUpdateInput,
  type PlayerCharacterSheetResponse,
} from "@ordem/contracts";
import type { AuthenticatedSession } from "@/server/identity/session";
import { foundryRequest } from "@/server/integrations/foundry-worlds";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";

type SheetRow = Readonly<{
  campaign_id: string;
  world_id: string;
  foundry_actor_id: string;
  actor_name: string;
  projection_name: string | null;
  sheet_json: string | null;
  last_synced_at: string | null;
}>;

/** Personagem vinculado ao usuário na campanha, com a ficha projetada. */
export async function findOwnSheetRow(campaignId: string, userId: string): Promise<SheetRow | null> {
  return getD1()
    .prepare(
      `SELECT l.campaign_id, l.world_id, l.foundry_actor_id, l.actor_name,
              p.name AS projection_name, p.sheet_json, p.last_synced_at
       FROM campaign_character_links l
       INNER JOIN campaign_members cm
         ON cm.campaign_id = l.campaign_id AND cm.user_id = l.user_id AND cm.status = 'active'
       LEFT JOIN foundry_character_projections p
         ON p.campaign_id = l.campaign_id
        AND p.world_id = l.world_id
        AND p.foundry_actor_id = l.foundry_actor_id
        AND p.is_active = 1
       WHERE l.campaign_id = ? AND l.user_id = ?`,
    )
    .bind(campaignId, userId)
    .first<SheetRow>();
}

function parseSheet(row: SheetRow) {
  const parsed = row.sheet_json ? CharacterSheetSchema.safeParse(JSON.parse(row.sheet_json)) : null;
  return parsed?.success ? parsed.data : null;
}

/**
 * Ficha completa do personagem do próprio usuário. Outros jogadores nunca a
 * recebem: a consulta parte sempre do vínculo da sessão.
 */
export async function getOwnCharacterSheet(
  session: AuthenticatedSession,
  campaignId: string,
): Promise<PlayerCharacterSheetResponse> {
  requirePermission(session.principal, "character:self:read", { kind: "campaign", campaignId });
  const row = await findOwnSheetRow(campaignId, session.user.id);
  if (!row) {
    throw new HttpError(404, "character_link_not_found", "Você ainda não tem um personagem vinculado nesta campanha.");
  }
  return PlayerCharacterSheetResponseSchema.parse({
    campaignId: row.campaign_id,
    actorName: row.projection_name ?? row.actor_name,
    sheet: parseSheet(row),
    lastSyncedAt: toIsoDateTime(row.last_synced_at),
    notesUpdate: await latestNotesUpdate(campaignId, session.user.id),
  });
}

type NotesUpdateRow = Readonly<{
  id: string;
  campaign_id: string;
  status: CharacterNotesUpdate["status"];
  text: string;
  error: string | null;
  created_at: string;
  applied_at: string | null;
}>;

const NOTES_SELECT = "SELECT id, campaign_id, status, text, error, created_at, applied_at FROM character_note_updates";

function mapNotesUpdate(row: NotesUpdateRow): CharacterNotesUpdate {
  return CharacterNotesUpdateSchema.parse({
    id: row.id,
    status: row.status,
    text: row.text,
    error: row.error,
    requestedAt: toIsoDateTime(row.created_at),
    appliedAt: toIsoDateTime(row.applied_at),
  });
}

async function findNotesUpdate(updateId: string): Promise<NotesUpdateRow | null> {
  return getD1().prepare(`${NOTES_SELECT} WHERE id = ?`).bind(updateId).first<NotesUpdateRow>();
}

async function latestNotesUpdate(campaignId: string, userId: string): Promise<CharacterNotesUpdate | null> {
  const row = await getD1()
    .prepare(`${NOTES_SELECT} WHERE campaign_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .bind(campaignId, userId)
    .first<NotesUpdateRow>();
  return row ? mapNotesUpdate(row) : null;
}

/**
 * Pede ao módulo para gravar as anotações (a descrição do personagem). Só o
 * próprio jogador vinculado edita, uma alteração por vez, e o módulo recusa se
 * a descrição mudou no Foundry desde a versão que o jogador viu.
 */
export async function updateOwnCharacterNotes(
  session: AuthenticatedSession,
  campaignId: string,
  input: CharacterNotesUpdateInput,
  correlationId: string,
): Promise<CharacterNotesUpdate> {
  requirePermission(session.principal, "character:self:notes", { kind: "campaign", campaignId });
  const row = await findOwnSheetRow(campaignId, session.user.id);
  if (!row) {
    throw new HttpError(404, "character_link_not_found", "Você ainda não tem um personagem vinculado nesta campanha.");
  }
  const sheet = parseSheet(row);
  if (!sheet) {
    throw new HttpError(
      409,
      "module_outdated",
      "As anotações só podem ser editadas depois que o mestre atualizar o módulo do Foundry para a versão 0.11.0 ou mais nova.",
    );
  }
  if (sheet.notes.revision !== input.revision) {
    throw new HttpError(409, "notes_changed", "A descrição do personagem mudou no Foundry. Recarregue a ficha antes de editar.");
  }
  const text = input.text.replace(/\r\n/gu, "\n").trim();
  if (text === sheet.notes.text.trim()) {
    throw new HttpError(422, "notes_unchanged", "As anotações não mudaram.");
  }
  const previous = await latestNotesUpdate(campaignId, session.user.id);
  if (previous?.status === "pending_delivery") {
    throw new HttpError(
      409,
      "notes_update_pending",
      "A alteração anterior ainda está a caminho do Foundry. Aguarde ela ser gravada.",
    );
  }

  const id = crypto.randomUUID();
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `INSERT INTO character_note_updates (id, campaign_id, user_id, world_id, foundry_actor_id, text, base_revision)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, campaignId, session.user.id, row.world_id, row.foundry_actor_id, text, input.revision),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "character.notes.requested",
      entityType: "character_note_update",
      entityId: id,
      correlationId,
      details: { worldId: row.world_id, actorId: row.foundry_actor_id, characters: text.length },
    }),
  ]);

  try {
    const delivery = (await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(row.world_id)}/commands`,
      {
        method: "POST",
        correlationId,
        idempotencyKey: `portal:character-notes:${id}`,
        body: {
          command: {
            type: "character.notes.update",
            payload: {
              updateId: id,
              campaignId,
              actorId: row.foundry_actor_id,
              text,
              revision: input.revision,
              requestedBy: session.user.displayName,
              requestedAt: new Date().toISOString(),
            },
          },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        },
      },
    )) as Readonly<{ commandId: string }>;
    await db
      .prepare("UPDATE character_note_updates SET command_id = ? WHERE id = ? AND command_id IS NULL")
      .bind(delivery.commandId, id)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível avisar o Foundry.";
    await db
      .prepare(
        `UPDATE character_note_updates SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_delivery'`,
      )
      .bind(message.slice(0, 1_000), id)
      .run();
  }
  return mapNotesUpdate((await findNotesUpdate(id))!);
}

/** Resultado do módulo, repassado pelo bridge. */
export async function recordCharacterNotesDelivery(
  input: CharacterNotesDeliveryCallback,
  correlationId: string,
): Promise<CharacterNotesUpdate> {
  const current = await findNotesUpdate(input.updateId);
  if (!current) throw new HttpError(404, "notes_update_not_found", "Alteração de anotações não encontrada.");
  if (current.status !== "pending_delivery") return mapNotesUpdate(current);
  const status = input.outcome === "failed" ? "failed" : input.conflict ? "conflict" : "applied";
  const error =
    status === "conflict"
      ? "A descrição mudou no Foundry antes de a alteração chegar. Recarregue a ficha e edite de novo."
      : status === "failed"
        ? input.error
        : null;
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE character_note_updates
         SET status = ?, error = ?, command_id = COALESCE(command_id, ?),
             applied_at = CASE WHEN ? = 'applied' THEN ? ELSE applied_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_delivery'`,
      )
      .bind(status, error, input.commandId, status, input.deliveredAt, input.updateId),
    prepareAudit(db, {
      actorUserId: null,
      campaignId: current.campaign_id,
      action: `character.notes.${status}`,
      entityType: "character_note_update",
      entityId: input.updateId,
      correlationId,
      details: { commandId: input.commandId, error: input.error },
    }),
  ]);
  return mapNotesUpdate((await findNotesUpdate(input.updateId))!);
}
