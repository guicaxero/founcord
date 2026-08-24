import {
  FoundryCommandSchema,
  type FoundryCharacterProjection,
  type FoundryCommand,
  type FoundryCommandCreateRequest,
  type FoundryCommandResultRequest,
  type FoundryPairingApprovalRequest,
  type FoundryPairingPreview,
  type FoundryWorldIdentity,
  type FoundryWorldStatus,
} from "@vigilia/contracts";
import type { AuthenticatedWorld, FoundryEnv } from "./types";
import { FoundryBridgeError } from "./auth";

type WorldRow = Readonly<{
  id: string;
  campaign_id: string;
  world_instance_id: string;
}>;

type CommandRow = Readonly<{
  id: string;
  command_type: "actor.sync.request" | "chat.message.create";
  payload_json: string;
  lease_token: string;
  created_at: string;
  expires_at: string | null;
}>;

type InboxRow = Readonly<{
  status: "processing" | "succeeded" | "failed";
  attempts: number;
}>;

type PairingRow = Readonly<{
  id: string;
  device_code_hash: string;
  world_instance_id: string;
  foundry_world_id: string;
  world_title: string;
  system_id: "demonlord";
  foundry_version: string;
  system_version: string;
  module_version: string;
  status: "pending" | "authorized" | "cancelled" | "expired";
  campaign_id: string | null;
  campaign_name: string | null;
  world_id: string | null;
  expires_at: string;
  consumed_at: string | null;
}>;

export type FoundryPairingState = Readonly<{
  pairingId: string;
  status: PairingRow["status"];
  expiresAt: string;
  worldId: string | null;
  campaignId: string | null;
  campaignName: string | null;
}>;

export async function createFoundryPairing(
  env: FoundryEnv,
  input: FoundryWorldIdentity,
  deviceCodeHash: string,
  userCodeHash: string,
  requestKeyHash: string,
  expiresAt: string,
): Promise<string> {
  const [requestRate, globalRate] = await Promise.all([
    env.INTEGRATION_DB.prepare(
      `SELECT COUNT(*) AS count FROM foundry_pairing_sessions
       WHERE request_key_hash = ? AND created_at >= datetime('now', '-10 minutes')`,
    ).bind(requestKeyHash).first<{ count: number }>(),
    env.INTEGRATION_DB.prepare(
      `SELECT COUNT(*) AS count FROM foundry_pairing_sessions
       WHERE created_at >= datetime('now', '-1 minute')`,
    ).first<{ count: number }>(),
  ]);
  if (Number(requestRate?.count ?? 0) >= 5 || Number(globalRate?.count ?? 0) >= 60) {
    throw new FoundryBridgeError(
      429,
      "pairing_rate_limited",
      "Muitas solicitações de conexão. Aguarde alguns minutos e tente novamente.",
    );
  }
  const pairingId = crypto.randomUUID();
  await env.INTEGRATION_DB.batch([
    env.INTEGRATION_DB.prepare(
      `DELETE FROM foundry_pairing_sessions WHERE created_at < datetime('now', '-1 day')`,
    ),
    env.INTEGRATION_DB.prepare(
      `UPDATE foundry_pairing_sessions
       SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE world_instance_id = ? AND status = 'pending'`,
    ).bind(input.worldInstanceId),
    env.INTEGRATION_DB.prepare(
      `INSERT INTO foundry_pairing_sessions (
        id, device_code_hash, user_code_hash, request_key_hash, world_instance_id,
        foundry_world_id, world_title, system_id, foundry_version,
        system_version, module_version, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'demonlord', ?, ?, ?, ?)`,
    ).bind(
      pairingId,
      deviceCodeHash,
      userCodeHash,
      requestKeyHash,
      input.worldInstanceId,
      input.foundryWorldId,
      input.worldTitle,
      input.foundryVersion,
      input.systemVersion,
      input.moduleVersion,
      expiresAt,
    ),
  ]);
  return pairingId;
}

export async function previewFoundryPairing(
  env: FoundryEnv,
  userCodeHash: string,
  userCode: string,
): Promise<FoundryPairingPreview | null> {
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT id, device_code_hash, world_instance_id, foundry_world_id,
            world_title, system_id, foundry_version, system_version,
            module_version, status, campaign_id, campaign_name, world_id,
            expires_at, consumed_at
     FROM foundry_pairing_sessions WHERE user_code_hash = ?`,
  )
    .bind(userCodeHash)
    .first<PairingRow>();
  if (!row) return null;
  const status = await expirePairingIfNeeded(env, row);
  return {
    pairingId: row.id,
    userCode,
    worldInstanceId: row.world_instance_id,
    foundryWorldId: row.foundry_world_id,
    worldTitle: row.world_title,
    systemId: row.system_id,
    foundryVersion: row.foundry_version,
    systemVersion: row.system_version,
    moduleVersion: row.module_version,
    status,
    expiresAt: normalizeD1Date(row.expires_at),
  };
}

export async function authorizeFoundryPairing(
  env: FoundryEnv,
  pairingId: string,
  input: FoundryPairingApprovalRequest,
): Promise<Readonly<{ worldId: string; pairing: FoundryPairingState }>> {
  const row = await findPairingById(env, pairingId);
  if (!row) {
    throw new FoundryBridgeError(404, "pairing_not_found", "Solicitação não encontrada.");
  }
  const status = await expirePairingIfNeeded(env, row);
  if (status === "expired") {
    throw new FoundryBridgeError(409, "pairing_expired", "Este código expirou.");
  }
  if (status === "cancelled") {
    throw new FoundryBridgeError(409, "pairing_cancelled", "Esta solicitação foi cancelada.");
  }
  if (status === "authorized") {
    if (
      row.campaign_id === input.campaignId &&
      row.campaign_name &&
      row.world_id
    ) {
      return {
        worldId: row.world_id,
        pairing: mapPairingState(row, "authorized"),
      };
    }
    throw new FoundryBridgeError(409, "pairing_already_used", "Este código já foi utilizado.");
  }

  const existing = await env.INTEGRATION_DB.prepare(
    `SELECT id, campaign_id FROM foundry_worlds
     WHERE world_instance_id = ? AND revoked_at IS NULL`,
  )
    .bind(row.world_instance_id)
    .first<{ id: string; campaign_id: string }>();
  if (existing && existing.campaign_id !== input.campaignId) {
    throw new FoundryBridgeError(
      409,
      "world_already_linked",
      "Este mundo já está conectado a outra campanha. Desconecte o vínculo atual primeiro.",
    );
  }

  const worldId = existing?.id ?? crypto.randomUUID();
  const [, result] = await env.INTEGRATION_DB.batch([
    env.INTEGRATION_DB.prepare(
      `INSERT INTO foundry_worlds (
        id, campaign_id, world_instance_id, foundry_world_id, world_title,
        system_id, foundry_version, system_version, module_version,
        access_token_hash, access_token_prefix
      )
      SELECT ?, ?, ?, ?, ?, 'demonlord', ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM foundry_pairing_sessions
        WHERE id = ? AND status = 'pending'
          AND datetime(expires_at) > CURRENT_TIMESTAMP
      )
      ON CONFLICT(world_instance_id) DO UPDATE SET
        campaign_id = excluded.campaign_id,
        foundry_world_id = excluded.foundry_world_id,
        world_title = excluded.world_title,
        system_id = excluded.system_id,
        foundry_version = excluded.foundry_version,
        system_version = excluded.system_version,
        module_version = excluded.module_version,
        access_token_hash = excluded.access_token_hash,
        access_token_prefix = excluded.access_token_prefix,
        revoked_at = NULL,
        updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      worldId,
      input.campaignId,
      row.world_instance_id,
      row.foundry_world_id,
      row.world_title,
      row.foundry_version,
      row.system_version,
      row.module_version,
      `pending:${crypto.randomUUID()}`,
      "pending",
      pairingId,
    ),
    env.INTEGRATION_DB.prepare(
      `UPDATE foundry_pairing_sessions
       SET status = 'authorized', campaign_id = ?, campaign_name = ?,
           authorized_by_user_id = ?, world_id = ?,
           authorized_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'
         AND datetime(expires_at) > CURRENT_TIMESTAMP`,
    ).bind(
      input.campaignId,
      input.campaignName,
      input.authorizedByUserId,
      worldId,
      pairingId,
    ),
  ]);
  if (!result || (result.meta.changes ?? 0) === 0) {
    throw new FoundryBridgeError(
      409,
      "pairing_already_used",
      "Esta solicitação não está mais disponível.",
    );
  }
  return {
    worldId,
    pairing: {
      pairingId,
      status: "authorized",
      expiresAt: normalizeD1Date(row.expires_at),
      worldId,
      campaignId: input.campaignId,
      campaignName: input.campaignName,
    },
  };
}

export async function pollFoundryPairing(
  env: FoundryEnv,
  pairingId: string,
  deviceCodeHash: string,
  accessTokenHash: string,
  accessTokenPrefix: string,
): Promise<FoundryPairingState | null> {
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT id, device_code_hash, world_instance_id, foundry_world_id,
            world_title, system_id, foundry_version, system_version,
            module_version, status, campaign_id, campaign_name, world_id,
            expires_at, consumed_at
     FROM foundry_pairing_sessions
     WHERE id = ? AND device_code_hash = ?`,
  )
    .bind(pairingId, deviceCodeHash)
    .first<PairingRow>();
  if (!row) return null;
  const status = await expirePairingIfNeeded(env, row);
  if (status === "authorized") {
    if (row.consumed_at) {
      throw new FoundryBridgeError(
        409,
        "pairing_consumed",
        "Esta autorização já foi entregue ao Foundry. Gere um novo código se a conexão não foi concluída.",
      );
    }
    if (!row.world_id) {
      throw new FoundryBridgeError(503, "pairing_finalizing", "A conexão está sendo finalizada.");
    }
    const [worldResult, pairingResult] = await env.INTEGRATION_DB.batch([
      env.INTEGRATION_DB.prepare(
        `UPDATE foundry_worlds
         SET access_token_hash = ?, access_token_prefix = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND revoked_at IS NULL
           AND EXISTS (
             SELECT 1 FROM foundry_pairing_sessions
             WHERE id = ? AND device_code_hash = ? AND consumed_at IS NULL
           )`,
      ).bind(accessTokenHash, accessTokenPrefix, row.world_id, pairingId, deviceCodeHash),
      env.INTEGRATION_DB.prepare(
        `UPDATE foundry_pairing_sessions
         SET consumed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND device_code_hash = ? AND consumed_at IS NULL
           AND EXISTS (
             SELECT 1 FROM foundry_worlds
             WHERE id = ? AND access_token_hash = ? AND revoked_at IS NULL
           )`,
      ).bind(pairingId, deviceCodeHash, row.world_id, accessTokenHash),
    ]);
    if (!pairingResult || (pairingResult.meta.changes ?? 0) === 0) {
      throw new FoundryBridgeError(409, "pairing_consumed", "Esta autorização já foi entregue ao Foundry.");
    }
    if (!worldResult || (worldResult.meta.changes ?? 0) === 0) {
      throw new FoundryBridgeError(503, "pairing_finalizing", "A conexão não pôde ser finalizada.");
    }
  }
  return mapPairingState(row, status);
}

export async function cancelFoundryPairing(
  env: FoundryEnv,
  pairingId: string,
  deviceCodeHash: string,
): Promise<boolean> {
  const result = await env.INTEGRATION_DB.prepare(
    `UPDATE foundry_pairing_sessions
     SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND device_code_hash = ? AND status = 'pending'`,
  )
    .bind(pairingId, deviceCodeHash)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

async function findPairingById(
  env: FoundryEnv,
  pairingId: string,
): Promise<PairingRow | null> {
  return env.INTEGRATION_DB.prepare(
    `SELECT id, device_code_hash, world_instance_id, foundry_world_id,
            world_title, system_id, foundry_version, system_version,
            module_version, status, campaign_id, campaign_name, world_id,
            expires_at, consumed_at
     FROM foundry_pairing_sessions WHERE id = ?`,
  )
    .bind(pairingId)
    .first<PairingRow>();
}

async function expirePairingIfNeeded(
  env: FoundryEnv,
  row: PairingRow,
): Promise<PairingRow["status"]> {
  if (row.status !== "pending" || Date.parse(normalizeD1Date(row.expires_at)) > Date.now()) {
    return row.status;
  }
  await env.INTEGRATION_DB.prepare(
    `UPDATE foundry_pairing_sessions
     SET status = 'expired', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(row.id)
    .run();
  return "expired";
}

function mapPairingState(
  row: PairingRow,
  status: PairingRow["status"],
): FoundryPairingState {
  return {
    pairingId: row.id,
    status,
    expiresAt: normalizeD1Date(row.expires_at),
    worldId: row.world_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
  };
}

export async function findWorldByTokenHash(
  env: FoundryEnv,
  worldId: string,
  tokenHash: string,
): Promise<AuthenticatedWorld | null> {
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT id, campaign_id, world_instance_id FROM foundry_worlds
     WHERE id = ? AND access_token_hash = ? AND revoked_at IS NULL`,
  )
    .bind(worldId, tokenHash)
    .first<WorldRow>();
  return row
    ? {
        id: row.id,
        campaignId: row.campaign_id,
        worldInstanceId: row.world_instance_id,
      }
    : null;
}

export async function recordHeartbeat(
  env: FoundryEnv,
  worldId: string,
  input: Readonly<{ observedAt: string; activeUsers: number; actorCount: number }>,
): Promise<void> {
  const result = await env.INTEGRATION_DB.prepare(
    `UPDATE foundry_worlds
     SET last_seen_at = CURRENT_TIMESTAMP, active_users = ?, actor_count = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND revoked_at IS NULL`,
  )
    .bind(input.activeUsers, input.actorCount, worldId)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new FoundryBridgeError(401, "world_revoked", "Mundo não autorizado.");
  }
}

export async function listFoundryWorlds(
  env: FoundryEnv,
  campaignId: string,
): Promise<FoundryWorldStatus[]> {
  const result = await env.INTEGRATION_DB.prepare(
    `SELECT id, campaign_id, world_title, foundry_world_id, foundry_version,
            system_version, module_version, last_seen_at, active_users,
            actor_count, revoked_at, registered_at,
            CASE
              WHEN revoked_at IS NOT NULL THEN 'revoked'
              WHEN last_seen_at IS NOT NULL
                AND (unixepoch('now') - unixepoch(last_seen_at)) <= 90 THEN 'online'
              ELSE 'offline'
            END AS connection_status
     FROM foundry_worlds
     WHERE campaign_id = ?
     ORDER BY world_title COLLATE NOCASE`,
  )
    .bind(campaignId)
    .all<{
    id: string;
    campaign_id: string;
    world_title: string;
    foundry_world_id: string;
    foundry_version: string;
    system_version: string;
    module_version: string;
    last_seen_at: string | null;
    active_users: number;
    actor_count: number;
    connection_status: "online" | "offline" | "revoked";
    registered_at: string;
  }>();
  return result.results.map((row) => ({
    worldId: row.id,
    campaignId: row.campaign_id,
    worldTitle: row.world_title,
    foundryWorldId: row.foundry_world_id,
    foundryVersion: row.foundry_version,
    systemVersion: row.system_version,
    moduleVersion: row.module_version,
    status: row.connection_status,
    lastSeenAt: row.last_seen_at ? normalizeD1Date(row.last_seen_at) : null,
    activeUsers: row.active_users,
    actorCount: row.actor_count,
    registeredAt: normalizeD1Date(row.registered_at),
  }));
}

export async function getFoundryWorldCredentialState(
  env: FoundryEnv,
  worldId: string,
): Promise<"active" | "revoked" | "missing"> {
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT revoked_at FROM foundry_worlds WHERE id = ?`,
  )
    .bind(worldId)
    .first<{ revoked_at: string | null }>();
  if (!row) return "missing";
  return row.revoked_at ? "revoked" : "active";
}

export async function revokeFoundryWorld(
  env: FoundryEnv,
  worldId: string,
  campaignId?: string,
): Promise<boolean> {
  const scopeClause = campaignId ? " AND campaign_id = ?" : "";
  const result = await env.INTEGRATION_DB.prepare(
    `UPDATE foundry_worlds
     SET revoked_at = CURRENT_TIMESTAMP, access_token_hash = 'revoked:' || id,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND revoked_at IS NULL${scopeClause}`,
  )
    .bind(...(campaignId ? [worldId, campaignId] : [worldId]))
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function enqueueFoundryCommand(
  env: FoundryEnv,
  worldId: string,
  idempotencyKey: string,
  input: FoundryCommandCreateRequest,
  campaignId?: string,
): Promise<Readonly<{ commandId: string; duplicate: boolean }>> {
  const scopeClause = campaignId ? " AND campaign_id = ?" : "";
  const world = await env.INTEGRATION_DB.prepare(
    `SELECT 1 AS found FROM foundry_worlds
     WHERE id = ? AND revoked_at IS NULL${scopeClause}`,
  )
    .bind(...(campaignId ? [worldId, campaignId] : [worldId]))
    .first<{ found: number }>();
  if (!world) throw new FoundryBridgeError(404, "world_not_found", "Mundo não encontrado.");

  const commandId = crypto.randomUUID();
  const inserted = await env.INTEGRATION_DB.prepare(
    `INSERT OR IGNORE INTO foundry_commands (
      id, world_id, command_type, payload_json, idempotency_key,
      available_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      commandId,
      worldId,
      input.command.type,
      JSON.stringify(input.command.payload),
      idempotencyKey,
      input.availableAt ?? new Date().toISOString(),
      input.expiresAt ?? null,
    )
    .run();
  if ((inserted.meta.changes ?? 0) > 0) {
    return { commandId, duplicate: false };
  }
  const existing = await env.INTEGRATION_DB.prepare(
    `SELECT id FROM foundry_commands
     WHERE world_id = ? AND idempotency_key = ?`,
  )
    .bind(worldId, idempotencyKey)
    .first<{ id: string }>();
  if (!existing) throw new Error("Could not resolve idempotent Foundry command.");
  return { commandId: existing.id, duplicate: true };
}

export async function pollFoundryCommands(
  env: FoundryEnv,
  worldId: string,
  limit: number,
): Promise<FoundryCommand[]> {
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + 30_000).toISOString();
  await env.INTEGRATION_DB.batch([
    env.INTEGRATION_DB.prepare(
      `UPDATE foundry_commands
       SET status = 'expired', lease_token = NULL, lease_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE world_id = ? AND status IN ('pending', 'dispatched')
         AND expires_at IS NOT NULL
         AND unixepoch(expires_at) <= unixepoch('now')`,
    ).bind(worldId),
    env.INTEGRATION_DB.prepare(
      `UPDATE foundry_commands
       SET status = 'failed', last_error = 'delivery lease exhausted',
           lease_token = NULL, lease_expires_at = NULL,
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE world_id = ? AND status = 'dispatched' AND attempts >= 6
         AND unixepoch(lease_expires_at) <= unixepoch('now')`,
    ).bind(worldId),
    env.INTEGRATION_DB.prepare(
      `UPDATE foundry_commands
       SET status = 'pending', lease_token = NULL, lease_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE world_id = ? AND status = 'dispatched' AND attempts < 6
         AND unixepoch(lease_expires_at) <= unixepoch('now')`,
    ).bind(worldId),
    env.INTEGRATION_DB.prepare(
      `UPDATE foundry_commands
       SET status = 'dispatched', attempts = attempts + 1,
           lease_token = ?, lease_expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT id FROM foundry_commands
         WHERE world_id = ? AND status = 'pending'
           AND unixepoch(available_at) <= unixepoch('now')
           AND (expires_at IS NULL OR unixepoch(expires_at) > unixepoch('now'))
         ORDER BY created_at LIMIT ?
       ) AND status = 'pending'`,
    ).bind(leaseToken, leaseExpiresAt, worldId, limit),
  ]);
  const claimed = await env.INTEGRATION_DB.prepare(
    `SELECT id, command_type, payload_json, lease_token, created_at, expires_at
     FROM foundry_commands WHERE world_id = ? AND lease_token = ?
     ORDER BY created_at`,
  )
    .bind(worldId, leaseToken)
    .all<CommandRow>();
  return claimed.results.map(commandFromRow);
}

export async function completeFoundryCommand(
  env: FoundryEnv,
  worldId: string,
  commandId: string,
  input: FoundryCommandResultRequest,
): Promise<"completed" | "already_completed"> {
  const result = await env.INTEGRATION_DB.prepare(
    `UPDATE foundry_commands
     SET status = ?, result_json = ?, last_error = ?, completed_at = CURRENT_TIMESTAMP,
         lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND world_id = ? AND status = 'dispatched' AND lease_token = ?`,
  )
    .bind(
      input.outcome,
      JSON.stringify(input.result),
      input.outcome === "failed" ? input.error ?? "Foundry command failed." : null,
      commandId,
      worldId,
      input.deliveryToken,
    )
    .run();
  if ((result.meta.changes ?? 0) > 0) return "completed";
  const existing = await env.INTEGRATION_DB.prepare(
    "SELECT status FROM foundry_commands WHERE id = ? AND world_id = ?",
  )
    .bind(commandId, worldId)
    .first<{ status: string }>();
  if (existing?.status === "succeeded" || existing?.status === "failed") {
    return "already_completed";
  }
  throw new FoundryBridgeError(
    409,
    "stale_command_delivery",
    "A entrega do comando expirou ou pertence a outro consumidor.",
  );
}

export async function claimFoundrySync(
  env: FoundryEnv,
  worldId: string,
  syncId: string,
): Promise<"claimed" | "processing" | "succeeded"> {
  const externalEventId = `${worldId}:${syncId}`;
  await env.INTEGRATION_DB.prepare(
    `INSERT OR IGNORE INTO integration_inbox_events (
      id, source, external_event_id, status, attempts
    ) VALUES (?, 'foundry', ?, 'processing', 0)`,
  )
    .bind(crypto.randomUUID(), externalEventId)
    .run();
  const claimed = await env.INTEGRATION_DB.prepare(
    `UPDATE integration_inbox_events
     SET status = 'processing', attempts = attempts + 1, last_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE source = 'foundry' AND external_event_id = ? AND attempts < 3
       AND (status = 'failed' OR (status = 'processing' AND attempts = 0))`,
  )
    .bind(externalEventId)
    .run();
  if ((claimed.meta.changes ?? 0) > 0) return "claimed";
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT status, attempts FROM integration_inbox_events
     WHERE source = 'foundry' AND external_event_id = ?`,
  )
    .bind(externalEventId)
    .first<InboxRow>();
  if (row?.status === "succeeded") return "succeeded";
  return "processing";
}

export async function completeFoundrySync(
  env: FoundryEnv,
  worldId: string,
  syncId: string,
  characters: FoundryCharacterProjection[],
): Promise<void> {
  const externalEventId = `${worldId}:${syncId}`;
  await env.INTEGRATION_DB.batch([
    env.INTEGRATION_DB.prepare(
      `UPDATE integration_inbox_events
       SET status = 'succeeded', result_entity_id = ?, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE source = 'foundry' AND external_event_id = ?`,
    ).bind(syncId, externalEventId),
    ...characters.map((character) =>
      env.INTEGRATION_DB.prepare(
        `INSERT INTO foundry_actor_links (
          id, world_id, actor_id, last_sync_id, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(world_id, actor_id) DO UPDATE SET
          last_sync_id = excluded.last_sync_id,
          last_seen_at = excluded.last_seen_at,
          updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        crypto.randomUUID(),
        worldId,
        character.actorId,
        syncId,
        character.sourceUpdatedAt,
      ),
    ),
  ]);
}

export async function failFoundrySync(
  env: FoundryEnv,
  worldId: string,
  syncId: string,
  error: unknown,
): Promise<void> {
  await env.INTEGRATION_DB.prepare(
    `UPDATE integration_inbox_events
     SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE source = 'foundry' AND external_event_id = ?`,
  )
    .bind(errorMessage(error), `${worldId}:${syncId}`)
    .run();
}

function commandFromRow(row: CommandRow): FoundryCommand {
  return FoundryCommandSchema.parse({
    id: row.id,
    type: row.command_type,
    payload: JSON.parse(row.payload_json) as unknown,
    deliveryToken: row.lease_token,
    createdAt: normalizeD1Date(row.created_at),
    expiresAt: row.expires_at ? normalizeD1Date(row.expires_at) : null,
  });
}

function normalizeD1Date(value: string): string {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown error").slice(0, 1_000);
}
