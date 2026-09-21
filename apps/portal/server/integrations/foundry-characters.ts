import type {
  FoundryCharacterProjection,
  FoundryCharacterSyncCallback,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";

export type FoundrySyncResult = Readonly<{
  syncId: string;
  accepted: number;
  duplicate: boolean;
  stale: boolean;
}>;

export async function recordFoundryCharacterSync(
  input: FoundryCharacterSyncCallback,
  correlationId: string,
): Promise<FoundrySyncResult> {
  const db = getD1();
  const previous = await db
    .prepare(
      `SELECT 1 AS found FROM audit_log
       WHERE action = 'foundry.characters.synced'
         AND entity_type = 'foundry_sync' AND entity_id = ?`,
    )
    .bind(input.syncId)
    .first<{ found: number }>();
  if (previous) {
    return { syncId: input.syncId, accepted: 0, duplicate: true, stale: false };
  }

  const campaign = await db
    .prepare("SELECT 1 AS found FROM campaigns WHERE id = ?")
    .bind(input.campaignId)
    .first<{ found: number }>();
  if (!campaign) {
    throw new HttpError(
      404,
      "campaign_not_found",
      "A campanha vinculada ao mundo do Foundry não existe.",
    );
  }

  const statements = [
    db
      .prepare(
        `INSERT INTO foundry_sync_cursors (
          world_id, campaign_id, last_sync_id, last_captured_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(world_id) DO UPDATE SET
          campaign_id = excluded.campaign_id,
          last_sync_id = excluded.last_sync_id,
          last_captured_at = excluded.last_captured_at,
          updated_at = CURRENT_TIMESTAMP
        WHERE excluded.last_captured_at > foundry_sync_cursors.last_captured_at`,
      )
      .bind(input.worldId, input.campaignId, input.syncId, input.capturedAt),
    db
      .prepare(
        `UPDATE foundry_character_projections
         SET is_active = 0, last_synced_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE world_id = ? AND campaign_id = ?
           AND EXISTS (
             SELECT 1 FROM foundry_sync_cursors
             WHERE world_id = ? AND last_sync_id = ?
           )`,
      )
      .bind(
        input.capturedAt,
        input.worldId,
        input.campaignId,
        input.worldId,
        input.syncId,
      ),
    ...input.characters.map((character) =>
      characterUpsert(
        db,
        input.campaignId,
        input.worldId,
        input.capturedAt,
        character,
        input.syncId,
      ),
    ),
    db
      .prepare(
        `INSERT INTO audit_log (
          id, actor_user_id, campaign_id, action, entity_type, entity_id,
          correlation_id, details_json
        )
        SELECT ?, NULL, ?, 'foundry.characters.synced', 'foundry_sync', ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM audit_log
          WHERE action = 'foundry.characters.synced'
            AND entity_type = 'foundry_sync' AND entity_id = ?
        ) AND EXISTS (
          SELECT 1 FROM foundry_sync_cursors
          WHERE world_id = ? AND last_sync_id = ?
        )`,
      )
      .bind(
        crypto.randomUUID(),
        input.campaignId,
        input.syncId,
        correlationId,
        JSON.stringify({
          worldId: input.worldId,
          capturedAt: input.capturedAt,
          characterCount: input.characters.length,
        }),
        input.syncId,
        input.worldId,
        input.syncId,
      ),
  ];

  const results = await db.batch(statements);
  const applied = (results[0]?.meta.changes ?? 0) > 0;
  return {
    syncId: input.syncId,
    accepted: applied ? input.characters.length : 0,
    duplicate: false,
    stale: !applied,
  };
}

function characterUpsert(
  db: D1Database,
  campaignId: string,
  worldId: string,
  capturedAt: string,
  character: FoundryCharacterProjection,
  syncId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO foundry_character_projections (
        id, campaign_id, world_id, foundry_actor_id, name,
        owner_user_ids_json, level, ancestry, novice_path, expert_path,
        master_path, legendary_path, health_max, damage, healing_rate,
        insanity, corruption, wealth_gc, wealth_ss, wealth_cp, wealth_bits,
        source_updated_at, last_synced_at, is_active
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
      WHERE EXISTS (
        SELECT 1 FROM foundry_sync_cursors
        WHERE world_id = ? AND last_sync_id = ?
      )
      ON CONFLICT(world_id, foundry_actor_id) DO UPDATE SET
        campaign_id = excluded.campaign_id,
        name = excluded.name,
        owner_user_ids_json = excluded.owner_user_ids_json,
        level = excluded.level,
        ancestry = excluded.ancestry,
        novice_path = excluded.novice_path,
        expert_path = excluded.expert_path,
        master_path = excluded.master_path,
        legendary_path = excluded.legendary_path,
        health_max = excluded.health_max,
        damage = excluded.damage,
        healing_rate = excluded.healing_rate,
        insanity = excluded.insanity,
        corruption = excluded.corruption,
        wealth_gc = excluded.wealth_gc,
        wealth_ss = excluded.wealth_ss,
        wealth_cp = excluded.wealth_cp,
        wealth_bits = excluded.wealth_bits,
        source_updated_at = excluded.source_updated_at,
        last_synced_at = excluded.last_synced_at,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
      `,
    )
    .bind(
      crypto.randomUUID(),
      campaignId,
      worldId,
      character.actorId,
      character.name,
      JSON.stringify(character.ownerUserIds),
      character.level,
      character.ancestry,
      character.paths.novice,
      character.paths.expert,
      character.paths.master,
      character.paths.legendary,
      character.statistics.healthMax,
      character.statistics.damage,
      character.statistics.healingRate,
      character.statistics.insanity,
      character.statistics.corruption,
      character.wealth?.gc ?? null,
      character.wealth?.ss ?? null,
      character.wealth?.cp ?? null,
      character.wealth?.bits ?? null,
      character.sourceUpdatedAt,
      capturedAt,
      worldId,
      syncId,
    );
}
