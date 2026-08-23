import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundryCommand } from "@vigilia/contracts";
import type { FoundryEnv } from "./types";

const repository = vi.hoisted(() => ({
  registerFoundryWorld: vi.fn(),
  claimFoundryEnrollment: vi.fn(),
  completeFoundryEnrollment: vi.fn(),
  findWorldByTokenHash: vi.fn(),
  recordHeartbeat: vi.fn(),
  listFoundryWorlds: vi.fn(),
  revokeFoundryWorld: vi.fn(),
  enqueueFoundryCommand: vi.fn(),
  pollFoundryCommands: vi.fn(),
  completeFoundryCommand: vi.fn(),
  claimFoundrySync: vi.fn(),
  completeFoundrySync: vi.fn(),
  failFoundrySync: vi.fn(),
}));

const portal = vi.hoisted(() => ({
  syncCharactersWithPortal: vi.fn(),
}));

vi.mock("./repository", () => repository);
vi.mock("./portal-client", () => portal);

import { foundryApp } from "./index";

const worldId = "22222222-2222-4222-8222-222222222222";
const campaignId = "11111111-1111-4111-8111-111111111111";
const accessToken = "a".repeat(43);
const enrollmentToken = "e".repeat(64);
const serviceToken = "s".repeat(64);

describe("Foundry Bridge Worker", () => {
  let env: FoundryEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    env = {
      INTEGRATION_DB: {
        prepare: vi.fn(() => ({ first: vi.fn(async () => ({ healthy: 1 })) })),
      } as unknown as D1Database,
      PORTAL: { fetch: vi.fn() } as unknown as Fetcher,
      FOUNDRY_ENROLLMENT_TOKEN: enrollmentToken,
      INTEGRATION_SERVICE_TOKEN: serviceToken,
    };
    repository.registerFoundryWorld.mockResolvedValue(worldId);
    repository.claimFoundryEnrollment.mockResolvedValue(true);
    repository.completeFoundryEnrollment.mockResolvedValue(undefined);
    repository.findWorldByTokenHash.mockResolvedValue({
      id: worldId,
      campaignId,
      worldInstanceId: "33333333-3333-4333-8333-333333333333",
    });
    repository.recordHeartbeat.mockResolvedValue(undefined);
    repository.claimFoundrySync.mockResolvedValue("claimed");
    repository.completeFoundrySync.mockResolvedValue(undefined);
    repository.failFoundrySync.mockResolvedValue(undefined);
    repository.pollFoundryCommands.mockResolvedValue([]);
    repository.completeFoundryCommand.mockResolvedValue("completed");
    repository.enqueueFoundryCommand.mockResolvedValue({
      commandId: "44444444-4444-4444-8444-444444444444",
      duplicate: false,
    });
    repository.listFoundryWorlds.mockResolvedValue([]);
    repository.revokeFoundryWorld.mockResolvedValue(true);
    portal.syncCharactersWithPortal.mockResolvedValue({
      syncId: "55555555-5555-4555-8555-555555555555",
      accepted: 1,
      duplicate: false,
      stale: false,
    });
  });

  it("faz health check incluindo o D1", async () => {
    const response = await request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "foundry-bridge", status: "ok" });
  });

  it("protege e registra somente mundos demonlord", async () => {
    const unauthorized = await request("/v1/worlds/register", {
      method: "POST",
      body: JSON.stringify(registrationBody()),
    });
    expect(unauthorized.status).toBe(401);

    const invalidSystem = await request("/v1/worlds/register", {
      method: "POST",
      headers: bearer(enrollmentToken),
      body: JSON.stringify({ ...registrationBody(), systemId: "dnd5e" }),
    });
    expect(invalidSystem.status).toBe(400);

    const registered = await request("/v1/worlds/register", {
      method: "POST",
      headers: bearer(enrollmentToken),
      body: JSON.stringify(registrationBody()),
    });
    const body = (await registered.json()) as { worldId: string; accessToken: string };
    expect(registered.status).toBe(201);
    expect(body.worldId).toBe(worldId);
    expect(body.accessToken).toHaveLength(43);
    expect(repository.registerFoundryWorld).toHaveBeenCalledOnce();
  });

  it("autentica heartbeat e atualiza a presença", async () => {
    const response = await request(`/v1/worlds/${worldId}/heartbeat`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({
        observedAt: "2026-08-23T02:00:00.000Z",
        activeUsers: 4,
        actorCount: 12,
      }),
    });
    expect(response.status).toBe(200);
    expect(repository.recordHeartbeat).toHaveBeenCalledWith(
      env,
      worldId,
      expect.objectContaining({ activeUsers: 4, actorCount: 12 }),
    );
  });

  it("sincroniza a projeção pelo portal e conclui o inbox", async () => {
    const sync = characterSync();
    const response = await request(`/v1/worlds/${worldId}/characters/sync`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify(sync),
    });
    expect(response.status).toBe(200);
    expect(portal.syncCharactersWithPortal).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ worldId, campaignId, syncId: sync.syncId }),
      expect.any(String),
    );
    expect(repository.completeFoundrySync).toHaveBeenCalledWith(
      env,
      worldId,
      sync.syncId,
      sync.characters,
    );
  });

  it("enfileira comandos internos com idempotência obrigatória", async () => {
    const missingKey = await request(`/internal/foundry/worlds/${worldId}/commands`, {
      method: "POST",
      headers: bearer(serviceToken),
      body: JSON.stringify({ command: { type: "actor.sync.request", payload: {} } }),
    });
    expect(missingKey.status).toBe(400);

    const response = await request(`/internal/foundry/worlds/${worldId}/commands`, {
      method: "POST",
      headers: {
        ...bearer(serviceToken),
        "idempotency-key": "mission:42:sync",
      },
      body: JSON.stringify({ command: { type: "actor.sync.request", payload: {} } }),
    });
    expect(response.status).toBe(201);
    expect(repository.enqueueFoundryCommand).toHaveBeenCalledWith(
      env,
      worldId,
      "mission:42:sync",
      expect.objectContaining({ command: { type: "actor.sync.request", payload: {} } }),
    );
  });

  it("entrega e confirma apenas comandos tipados", async () => {
    const command: FoundryCommand = {
      id: "44444444-4444-4444-8444-444444444444",
      type: "actor.sync.request",
      payload: {},
      deliveryToken: "66666666-6666-4666-8666-666666666666",
      createdAt: "2026-08-23T02:00:00.000Z",
      expiresAt: null,
    };
    repository.pollFoundryCommands.mockResolvedValue([command]);
    const polled = await request(`/v1/worlds/${worldId}/commands/poll`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ limit: 10 }),
    });
    expect(await polled.json()).toEqual({ commands: [command] });

    const completed = await request(
      `/v1/worlds/${worldId}/commands/${command.id}/result`,
      {
        method: "POST",
        headers: bearer(accessToken),
        body: JSON.stringify({
          deliveryToken: command.deliveryToken,
          outcome: "succeeded",
          result: { synchronizedCharacters: 8 },
          error: null,
        }),
      },
    );
    expect(completed.status).toBe(200);
    expect(repository.completeFoundryCommand).toHaveBeenCalledOnce();
  });

  function request(path: string, init?: RequestInit) {
    return foundryApp.fetch(
      new Request(`https://foundry.example${path}`, init),
      env,
      executionContext(),
    );
  }
});

function registrationBody() {
  return {
    campaignId,
    worldInstanceId: "33333333-3333-4333-8333-333333333333",
    foundryWorldId: "ordem-da-ultima-luz",
    worldTitle: "Ordem da Última Luz",
    systemId: "demonlord",
    foundryVersion: "14.320",
    systemVersion: "6.1.4",
    moduleVersion: "0.1.0",
  };
}

function characterSync() {
  return {
    syncId: "55555555-5555-4555-8555-555555555555",
    capturedAt: "2026-08-23T02:00:00.000Z",
    characters: [
      {
        actorId: "aster-001",
        name: "Aster",
        type: "character",
        ownerUserIds: ["user-001"],
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
        sourceUpdatedAt: "2026-08-23T01:59:00.000Z",
      },
    ],
  };
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

function executionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  } as unknown as ExecutionContext;
}
