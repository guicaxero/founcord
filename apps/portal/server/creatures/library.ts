import {
  CreatureDraftSchema,
  CreatureSchema,
  FoundryWorldListResponseSchema,
  moduleSupportsCreatures,
  type Creature,
  type CreatureCreateInput,
  type CreatureDeliveryCallback,
  type CreatureTarget,
  type CreatureUpdateInput,
} from "@ordem/contracts";
import type { AuthenticatedSession } from "@/server/identity/session";
import { foundryRequest } from "@/server/integrations/foundry-worlds";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";
import { requireCreatureManager, requiredEntry } from "./compendium";

type CreatureRow = Readonly<{
  id: string;
  campaign_id: string;
  data_json: string;
  based_on_entry_id: string | null;
  based_on_name: string | null;
  version: number;
  status: Creature["status"];
  sent_version: number;
  world_id: string | null;
  foundry_actor_id: string | null;
  error: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}>;

const CREATURE_SELECT = `SELECT c.id, c.campaign_id, c.data_json, c.based_on_entry_id, c.based_on_name,
    c.version, c.status, c.sent_version, c.world_id, c.foundry_actor_id, c.error,
    u.display_name AS created_by_name, c.created_at, c.updated_at, c.sent_at
  FROM creatures c
  INNER JOIN iam_users u ON u.id = c.created_by_user_id`;

function mapCreature(row: CreatureRow): Creature {
  return CreatureSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    draft: CreatureDraftSchema.parse(JSON.parse(row.data_json)),
    basedOn:
      row.based_on_entry_id && row.based_on_name ? { entryId: row.based_on_entry_id, name: row.based_on_name } : null,
    version: row.version,
    status: row.status,
    sentVersion: row.sent_version,
    worldId: row.world_id,
    foundryActorId: row.foundry_actor_id,
    error: row.error,
    createdByName: row.created_by_name,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
    sentAt: toIsoDateTime(row.sent_at),
  });
}

async function findCreature(creatureId: string): Promise<Creature | null> {
  const row = await getD1().prepare(`${CREATURE_SELECT} WHERE c.id = ?`).bind(creatureId).first<CreatureRow>();
  return row ? mapCreature(row) : null;
}

async function requiredCreature(campaignId: string, creatureId: string): Promise<Creature> {
  const creature = await findCreature(creatureId);
  if (!creature || creature.campaignId !== campaignId) {
    throw new HttpError(404, "creature_not_found", "Criatura não encontrada.");
  }
  return creature;
}

export async function listCreatures(session: AuthenticatedSession, campaignId: string): Promise<Creature[]> {
  requireCreatureManager(session, campaignId);
  const result = await getD1()
    .prepare(`${CREATURE_SELECT} WHERE c.campaign_id = ? ORDER BY c.updated_at DESC`)
    .bind(campaignId)
    .all<CreatureRow>();
  return result.results.map(mapCreature);
}

export async function getCreature(
  session: AuthenticatedSession,
  campaignId: string,
  creatureId: string,
): Promise<Creature> {
  requireCreatureManager(session, campaignId);
  return requiredCreature(campaignId, creatureId);
}

/** Cria a criatura na biblioteca, do zero ou a partir de uma entrada do bestiário. */
export async function createCreature(
  session: AuthenticatedSession,
  campaignId: string,
  input: CreatureCreateInput,
  correlationId: string,
): Promise<Creature> {
  requireCreatureManager(session, campaignId);
  const basedOn = input.basedOnEntryId ? await requiredEntry(campaignId, input.basedOnEntryId) : null;
  if (basedOn && basedOn.kind !== "creature") {
    throw new HttpError(422, "compendium_entry_not_creature", "Só criaturas do bestiário podem servir de base.");
  }
  const found = await getD1()
    .prepare("SELECT 1 AS found FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<{ found: number }>();
  if (!found) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");

  const id = crypto.randomUUID();
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `INSERT INTO creatures (id, campaign_id, created_by_user_id, name, data_json, based_on_entry_id, based_on_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        campaignId,
        session.user.id,
        input.draft.name,
        JSON.stringify(input.draft),
        basedOn?.id ?? null,
        basedOn?.name ?? null,
      ),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "creature.created",
      entityType: "creature",
      entityId: id,
      correlationId,
      details: { name: input.draft.name, basedOn: basedOn?.name ?? null },
    }),
  ]);
  return requiredCreature(campaignId, id);
}

/** Salva a ficha. A versão protege contra outra aba ter salvo antes. */
export async function updateCreature(
  session: AuthenticatedSession,
  campaignId: string,
  creatureId: string,
  input: CreatureUpdateInput,
  correlationId: string,
): Promise<Creature> {
  requireCreatureManager(session, campaignId);
  const current = await requiredCreature(campaignId, creatureId);
  if (current.version !== input.version) {
    throw new HttpError(409, "version_conflict", "Esta criatura foi alterada em outro lugar. Recarregue para ver a versão atual.");
  }
  const db = getD1();
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE creatures SET name = ?, data_json = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(input.draft.name, JSON.stringify(input.draft), creatureId, input.version),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "creature.updated",
      entityType: "creature",
      entityId: creatureId,
      correlationId,
      details: { name: input.draft.name, version: input.version + 1 },
    }),
  ]);
  if (!update?.meta.changes) {
    throw new HttpError(409, "version_conflict", "Esta criatura foi alterada em outro lugar. Recarregue para ver a versão atual.");
  }
  return requiredCreature(campaignId, creatureId);
}

/** Remove da biblioteca. O ator que já está no Foundry continua lá. */
export async function deleteCreature(
  session: AuthenticatedSession,
  campaignId: string,
  creatureId: string,
  correlationId: string,
): Promise<void> {
  requireCreatureManager(session, campaignId);
  const creature = await requiredCreature(campaignId, creatureId);
  const db = getD1();
  await db.batch([
    db.prepare("DELETE FROM creatures WHERE id = ?").bind(creatureId),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "creature.deleted",
      entityType: "creature",
      entityId: creatureId,
      correlationId,
      details: { name: creature.draft.name },
    }),
  ]);
}

/** Mundos que podem receber criaturas: módulo 0.10.0 ou mais novo. */
export async function listCreatureTargets(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<CreatureTarget[]> {
  requireCreatureManager(session, campaignId);
  const response = await foundryRequest(`/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds`, {
    method: "GET",
    correlationId,
  });
  const worlds = FoundryWorldListResponseSchema.parse({
    data: response && typeof response === "object" && "worlds" in response ? (response as { worlds: unknown }).worlds : [],
  }).data;
  return worlds.map((world) => ({
    worldId: world.worldId,
    worldTitle: world.worldTitle.slice(0, 120) || "Mundo sem nome",
    status: world.status,
    moduleVersion: world.moduleVersion.slice(0, 40),
    blockedReason:
      world.status === "revoked" ? "revoked" : moduleSupportsCreatures(world.moduleVersion) ? null : "module_outdated",
  }));
}

/**
 * Envia a versão salva ao Foundry. O módulo acha o ator pela marca da
 * criatura, então reenviar atualiza o mesmo ator em vez de criar outro.
 */
export async function sendCreature(
  session: AuthenticatedSession,
  campaignId: string,
  creatureId: string,
  worldId: string,
  correlationId: string,
): Promise<Creature> {
  requireCreatureManager(session, campaignId);
  const creature = await requiredCreature(campaignId, creatureId);
  if (creature.status === "pending_delivery" && creature.sentVersion === creature.version && creature.worldId === worldId) {
    return creature;
  }
  const target = (await listCreatureTargets(session, campaignId, correlationId)).find(
    (candidate) => candidate.worldId === worldId,
  );
  if (!target) throw new HttpError(404, "world_not_found", "Mundo não encontrado nesta campanha.");
  if (target.blockedReason === "module_outdated") {
    throw new HttpError(
      409,
      "module_outdated",
      "Atualize o módulo do Foundry para a versão 0.10.0 ou mais nova antes de enviar criaturas.",
    );
  }
  if (target.blockedReason === "revoked") {
    throw new HttpError(409, "world_revoked", "Este mundo foi desconectado da campanha.");
  }

  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE creatures
         SET status = 'pending_delivery', sent_version = ?, world_id = ?, command_id = NULL, error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(creature.version, worldId, creatureId, creature.version),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "creature.sent",
      entityType: "creature",
      entityId: creatureId,
      correlationId,
      details: { worldId, version: creature.version },
    }),
  ]);

  try {
    const delivery = (await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}/commands`,
      {
        method: "POST",
        correlationId,
        idempotencyKey: `portal:creature:${creatureId}:v${creature.version}:${worldId}`,
        body: {
          command: {
            type: "creature.upsert",
            payload: {
              creatureId,
              campaignId,
              version: creature.version,
              creature: creature.draft,
              requestedAt: new Date().toISOString(),
            },
          },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        },
      },
    )) as Readonly<{ commandId: string }>;
    await db
      .prepare(
        `UPDATE creatures SET command_id = ? WHERE id = ? AND status = 'pending_delivery' AND sent_version = ?`,
      )
      .bind(delivery.commandId, creatureId, creature.version)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível avisar o Foundry.";
    await db
      .prepare(
        `UPDATE creatures SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_delivery' AND sent_version = ?`,
      )
      .bind(message.slice(0, 1_000), creatureId, creature.version)
      .run();
  }
  return requiredCreature(campaignId, creatureId);
}

/** Resultado do módulo, repassado pelo bridge. Respostas de envios antigos são ignoradas. */
export async function recordCreatureDelivery(
  input: CreatureDeliveryCallback,
  correlationId: string,
): Promise<Creature> {
  const creature = await findCreature(input.creatureId);
  if (!creature) throw new HttpError(404, "creature_not_found", "Criatura não encontrada.");
  if (creature.status !== "pending_delivery" || creature.sentVersion !== input.version) return creature;
  const synced = input.outcome === "succeeded";
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE creatures
         SET status = ?, error = ?, command_id = COALESCE(command_id, ?),
             foundry_actor_id = COALESCE(?, foundry_actor_id),
             sent_at = CASE WHEN ? = 'synced' THEN ? ELSE sent_at END
         WHERE id = ? AND status = 'pending_delivery' AND sent_version = ?`,
      )
      .bind(
        synced ? "synced" : "failed",
        synced ? null : input.error,
        input.commandId,
        synced ? input.actorId : null,
        synced ? "synced" : "failed",
        input.deliveredAt,
        input.creatureId,
        input.version,
      ),
    prepareAudit(db, {
      actorUserId: null,
      campaignId: creature.campaignId,
      action: synced ? "creature.synced" : "creature.failed",
      entityType: "creature",
      entityId: input.creatureId,
      correlationId,
      details: { commandId: input.commandId, version: input.version, error: input.error },
    }),
  ]);
  return (await findCreature(input.creatureId))!;
}
