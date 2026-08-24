import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const origin = "http://localhost:8788";
const campaignId = "11111111-1111-4111-8111-111111111111";
const otherCampaignId = "99999999-9999-4999-8999-999999999999";
const serviceToken = "test-integration-token-with-at-least-32-bytes";
const staleSyncId = "66666666-6666-4666-8666-666666666666";

test("Marco 3: pareamento, escopo de campanha, presença e fila Foundry", async () => {
  const serverRoot = join(root, ".wrangler", "foundry-test-bundle");
  const portalCalls = [];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: [{ type: "ESModule", path: join(serverRoot, "worker.js") }],
      modulesRoot: serverRoot,
      compatibilityDate: "2026-08-21",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: ["INTEGRATION_DB"],
      bindings: {
        INTEGRATION_SERVICE_TOKEN: serviceToken,
        PORTAL_URL: "https://portal.example.test",
      },
      serviceBindings: {
        PORTAL: async (request) => {
          const body = await request.json();
          portalCalls.push({ url: request.url, body });
          const stale = body.syncId === staleSyncId;
          return Response.json({
            syncId: body.syncId,
            accepted: stale ? 0 : body.characters.length,
            duplicate: false,
            stale,
          });
        },
      },
    }),
  );

  try {
    const db = await mf.getD1Database("INTEGRATION_DB");
    await applyMigrations(db);

    const health = await mf.dispatchFetch(`${origin}/health`);
    assert.equal(health.status, 200);

    const invalidSystem = await api(mf, "/v1/pairings", {
      method: "POST",
      body: { ...registrationBody(), systemId: "dnd5e" },
    });
    assert.equal(invalidSystem.status, 400);

    const registration = await api(mf, "/v1/pairings", {
      method: "POST",
      body: registrationBody(),
    });
    assert.equal(registration.status, 201, JSON.stringify(registration.data));
    assert.match(registration.data.pairingId, /^[0-9a-f-]{36}$/u);
    assert.match(registration.data.userCode, /^LUME-/u);
    assert.equal(registration.data.deviceCode.length, 43);
    assert.equal(
      registration.data.verificationUriComplete,
      `https://portal.example.test/foundry/connect?code=${registration.data.userCode}`,
    );
    const { pairingId, deviceCode, userCode } = registration.data;

    const unauthenticatedPoll = await api(mf, `/v1/pairings/${pairingId}/poll`, {
      method: "POST",
    });
    assert.equal(unauthenticatedPoll.status, 401);

    const pending = await api(mf, `/v1/pairings/${pairingId}/poll`, {
      method: "POST",
      token: deviceCode,
    });
    assert.equal(pending.status, 200);
    assert.equal(pending.data.status, "pending");

    const preview = await api(mf, "/internal/foundry/pairings/preview", {
      method: "POST",
      token: serviceToken,
      body: { userCode },
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.equal(preview.data.worldTitle, "Ordem da Última Luz");
    assert.equal(preview.data.status, "pending");

    const approvalBody = {
      campaignId,
      campaignName: "Ordem da Última Luz",
      authorizedByUserId: "88888888-8888-4888-8888-888888888888",
    };
    const approved = await api(
      mf,
      `/internal/foundry/pairings/${pairingId}/approve`,
      { method: "POST", token: serviceToken, body: approvalBody },
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.data));
    const worldId = approved.data.worldId;

    const reusedForAnotherCampaign = await api(
      mf,
      `/internal/foundry/pairings/${pairingId}/approve`,
      {
        method: "POST",
        token: serviceToken,
        body: { ...approvalBody, campaignId: otherCampaignId },
      },
    );
    assert.equal(reusedForAnotherCampaign.status, 409);

    const authorized = await api(mf, `/v1/pairings/${pairingId}/poll`, {
      method: "POST",
      token: deviceCode,
    });
    assert.equal(authorized.status, 200, JSON.stringify(authorized.data));
    assert.equal(authorized.data.status, "authorized");
    assert.equal(authorized.data.worldId, worldId);
    assert.equal(authorized.data.campaignName, "Ordem da Última Luz");
    assert.equal(authorized.data.accessToken.length, 43);
    assert.notEqual(authorized.data.accessToken, deviceCode);
    const accessToken = authorized.data.accessToken;

    const consumedPoll = await api(mf, `/v1/pairings/${pairingId}/poll`, {
      method: "POST",
      token: deviceCode,
    });
    assert.equal(consumedPoll.status, 409);
    assert.equal(consumedPoll.data.error, "pairing_consumed");

    const pairingRow = await db
      .prepare(
        "SELECT device_code_hash, user_code_hash, status FROM foundry_pairing_sessions WHERE id = ?",
      )
      .bind(pairingId)
      .first();
    assert.equal(pairingRow.status, "authorized");
    assert.notEqual(pairingRow.device_code_hash, deviceCode);
    assert.notEqual(pairingRow.user_code_hash, userCode);

    const heartbeatWithDeviceCode = await api(mf, `/v1/worlds/${worldId}/heartbeat`, {
      method: "POST",
      token: deviceCode,
      body: {
        observedAt: "2099-01-01T00:00:00.000Z",
        activeUsers: 1,
        actorCount: 0,
      },
    });
    assert.equal(heartbeatWithDeviceCode.status, 401);
    assert.equal(heartbeatWithDeviceCode.data.error, "invalid_world_token");

    const heartbeat = await api(mf, `/v1/worlds/${worldId}/heartbeat`, {
      method: "POST",
      token: accessToken,
      body: {
        observedAt: "2099-01-01T00:00:00.000Z",
        activeUsers: 4,
        actorCount: 1,
      },
    });
    assert.equal(heartbeat.status, 200, JSON.stringify(heartbeat.data));

    const worlds = await api(mf, `/internal/foundry/campaigns/${campaignId}/worlds`, {
      token: serviceToken,
    });
    assert.equal(worlds.status, 200);
    assert.equal(worlds.data.worlds[0].status, "online");
    assert.notEqual(worlds.data.worlds[0].lastSeenAt, "2099-01-01T00:00:00.000Z");

    const otherCampaignWorlds = await api(
      mf,
      `/internal/foundry/campaigns/${otherCampaignId}/worlds`,
      { token: serviceToken },
    );
    assert.deepEqual(otherCampaignWorlds.data.worlds, []);

    const crossCampaignCommand = await api(
      mf,
      `/internal/foundry/campaigns/${otherCampaignId}/worlds/${worldId}/commands`,
      {
        method: "POST",
        token: serviceToken,
        headers: { "idempotency-key": "test:cross:campaign" },
        body: { command: { type: "actor.sync.request", payload: {} } },
      },
    );
    assert.equal(crossCampaignCommand.status, 404);

    const commandPath = `/internal/foundry/campaigns/${campaignId}/worlds/${worldId}/commands`;
    const commandBody = {
      command: { type: "actor.sync.request", payload: {} },
    };
    const created = await api(mf, commandPath, {
      method: "POST",
      token: serviceToken,
      headers: { "idempotency-key": "test:actor:sync:001" },
      body: commandBody,
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const duplicate = await api(mf, commandPath, {
      method: "POST",
      token: serviceToken,
      headers: { "idempotency-key": "test:actor:sync:001" },
      body: commandBody,
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.commandId, created.data.commandId);
    assert.equal(duplicate.data.duplicate, true);

    const polled = await api(mf, `/v1/worlds/${worldId}/commands/poll`, {
      method: "POST",
      token: accessToken,
      body: { limit: 10 },
    });
    assert.equal(polled.status, 200, JSON.stringify(polled.data));
    assert.equal(polled.data.commands.length, 1);
    assert.equal(polled.data.commands[0].type, "actor.sync.request");

    const command = polled.data.commands[0];
    const completed = await api(
      mf,
      `/v1/worlds/${worldId}/commands/${command.id}/result`,
      {
        method: "POST",
        token: accessToken,
        body: {
          deliveryToken: command.deliveryToken,
          outcome: "succeeded",
          result: { synchronizedCharacters: 1 },
          error: null,
        },
      },
    );
    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    const commandRow = await db
      .prepare("SELECT status, attempts FROM foundry_commands WHERE id = ?")
      .bind(command.id)
      .first();
    assert.deepEqual(commandRow, { status: "succeeded", attempts: 1 });

    const syncId = "55555555-5555-4555-8555-555555555555";
    const synced = await api(mf, `/v1/worlds/${worldId}/characters/sync`, {
      method: "POST",
      token: accessToken,
      body: characterSync(syncId),
    });
    assert.equal(synced.status, 200, JSON.stringify(synced.data));
    assert.equal(portalCalls.length, 1);
    assert.equal(portalCalls[0].body.campaignId, campaignId);
    assert.equal(portalCalls[0].body.worldId, worldId);
    const actorLink = await db
      .prepare(
        "SELECT actor_id, last_sync_id FROM foundry_actor_links WHERE world_id = ?",
      )
      .bind(worldId)
      .first();
    assert.deepEqual(actorLink, { actor_id: "aster-001", last_sync_id: syncId });

    const staleSync = await api(mf, `/v1/worlds/${worldId}/characters/sync`, {
      method: "POST",
      token: accessToken,
      body: characterSync(staleSyncId),
    });
    assert.equal(staleSync.status, 200, JSON.stringify(staleSync.data));
    assert.equal(staleSync.data.stale, true);
    const actorLinkAfterStale = await db
      .prepare(
        "SELECT actor_id, last_sync_id FROM foundry_actor_links WHERE world_id = ?",
      )
      .bind(worldId)
      .first();
    assert.deepEqual(actorLinkAfterStale, {
      actor_id: "aster-001",
      last_sync_id: syncId,
    });

    const duplicateSync = await api(mf, `/v1/worlds/${worldId}/characters/sync`, {
      method: "POST",
      token: accessToken,
      body: characterSync(syncId),
    });
    assert.equal(duplicateSync.data.duplicate, true);
    assert.equal(portalCalls.length, 2);

    const crossCampaignRevoke = await api(
      mf,
      `/internal/foundry/campaigns/${otherCampaignId}/worlds/${worldId}`,
      { method: "DELETE", token: serviceToken },
    );
    assert.equal(crossCampaignRevoke.status, 404);

    const stillAuthorized = await api(mf, `/v1/worlds/${worldId}/heartbeat`, {
      method: "POST",
      token: accessToken,
      body: {
        observedAt: new Date().toISOString(),
        activeUsers: 1,
        actorCount: 1,
      },
    });
    assert.equal(stillAuthorized.status, 200);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const additionalPairing = await api(mf, "/v1/pairings", {
        method: "POST",
        body: registrationBody(),
      });
      assert.equal(additionalPairing.status, 201);
    }
    const rateLimitedPairing = await api(mf, "/v1/pairings", {
      method: "POST",
      body: registrationBody(),
    });
    assert.equal(rateLimitedPairing.status, 429);
    assert.equal(rateLimitedPairing.data.error, "pairing_rate_limited");

    const revoked = await api(
      mf,
      `/internal/foundry/campaigns/${campaignId}/worlds/${worldId}`,
      {
      method: "DELETE",
      token: serviceToken,
      },
    );
    assert.equal(revoked.status, 200);
    const afterRevoke = await api(mf, `/v1/worlds/${worldId}/heartbeat`, {
      method: "POST",
      token: accessToken,
      body: {
        observedAt: new Date().toISOString(),
        activeUsers: 1,
        actorCount: 1,
      },
    });
    assert.equal(afterRevoke.status, 401);
    assert.equal(afterRevoke.data.error, "world_revoked");
  } finally {
    await mf.dispose();
  }
});

async function applyMigrations(db) {
  const directory = join(root, "drizzle-integration");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(join(directory, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await db.prepare(query).run();
    }
  }
}

async function api(mf, path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const response = await mf.dispatchFetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
  };
}

function registrationBody() {
  return {
    worldInstanceId: "33333333-3333-4333-8333-333333333333",
    foundryWorldId: "ordem-da-ultima-luz",
    worldTitle: "Ordem da Última Luz",
    systemId: "demonlord",
    foundryVersion: "14.320",
    systemVersion: "6.1.4",
    moduleVersion: "0.2.0",
  };
}

function characterSync(syncId) {
  return {
    syncId,
    capturedAt: new Date().toISOString(),
    characters: [
      {
        actorId: "aster-001",
        name: "Aster",
        type: "character",
        ownerUserIds: ["foundry-user-1"],
        level: 2,
        ancestry: "Humano",
        paths: { novice: "Guerreiro", expert: null, master: null, legendary: null },
        statistics: {
          healthMax: 18,
          damage: 3,
          healingRate: 4,
          insanity: 1,
          corruption: 0,
        },
        sourceUpdatedAt: new Date().toISOString(),
      },
    ],
  };
}
