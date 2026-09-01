import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundryCommand } from "@vigilia/contracts";
import type { FoundryEnv } from "./types";

const repository = vi.hoisted(() => ({
  createFoundryPairing: vi.fn(),
  previewFoundryPairing: vi.fn(),
  authorizeFoundryPairing: vi.fn(),
  pollFoundryPairing: vi.fn(),
  cancelFoundryPairing: vi.fn(),
  findWorldByTokenHash: vi.fn(),
  recordHeartbeat: vi.fn(),
  listFoundryWorlds: vi.fn(),
  revokeFoundryWorld: vi.fn(),
  enqueueFoundryCommand: vi.fn(),
  pollFoundryCommands: vi.fn(),
  completeFoundryCommand: vi.fn(),
  claimFoundrySync: vi.fn(),
  claimFoundryMerchantSync: vi.fn(),
  completeFoundrySync: vi.fn(),
  completeFoundryMerchantSync: vi.fn(),
  failFoundrySync: vi.fn(),
  failFoundryMerchantSync: vi.fn(),
  getFoundryMerchantCatalog: vi.fn(),
  startFoundryCaptureSession: vi.fn(),
  listFoundryCaptureSessions: vi.fn(),
  endFoundryCaptureSession: vi.fn(),
  cancelFoundryCaptureSession: vi.fn(),
  recordFoundryChatBatch: vi.fn(),
  getFoundryCaptureTranscript: vi.fn(),
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
const serviceToken = "s".repeat(64);
const pairingId = "77777777-7777-4777-8777-777777777777";

describe("Foundry Bridge Worker", () => {
  let env: FoundryEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    env = {
      INTEGRATION_DB: {
        prepare: vi.fn(() => ({ first: vi.fn(async () => ({ healthy: 1 })) })),
      } as unknown as D1Database,
      PORTAL: { fetch: vi.fn() } as unknown as Fetcher,
      INTEGRATION_SERVICE_TOKEN: serviceToken,
      PORTAL_URL: "https://portal.example",
    };
    repository.createFoundryPairing.mockResolvedValue(pairingId);
    repository.previewFoundryPairing.mockResolvedValue({
      pairingId,
      userCode: "LUME-7K4P-9Q2M",
      worldInstanceId: "33333333-3333-4333-8333-333333333333",
      foundryWorldId: "ordem-da-ultima-luz",
      worldTitle: "Ordem da Última Luz",
      systemId: "demonlord",
      foundryVersion: "14.320",
      systemVersion: "6.1.4",
      moduleVersion: "0.2.0",
      status: "pending",
      expiresAt: "2026-08-24T15:10:00.000Z",
    });
    repository.authorizeFoundryPairing.mockResolvedValue({
      worldId,
      pairing: {
        pairingId,
        status: "authorized",
        expiresAt: "2026-08-24T15:10:00.000Z",
        worldId,
        campaignId,
        campaignName: "Ordem da Última Luz",
      },
    });
    repository.pollFoundryPairing.mockResolvedValue({
      pairingId,
      status: "pending",
      expiresAt: "2026-08-24T15:10:00.000Z",
      worldId: null,
      campaignId: null,
      campaignName: null,
    });
    repository.cancelFoundryPairing.mockResolvedValue(true);
    repository.findWorldByTokenHash.mockResolvedValue({
      id: worldId,
      campaignId,
      worldInstanceId: "33333333-3333-4333-8333-333333333333",
    });
    repository.recordHeartbeat.mockResolvedValue(undefined);
    repository.claimFoundrySync.mockResolvedValue("claimed");
    repository.claimFoundryMerchantSync.mockResolvedValue("claimed");
    repository.completeFoundrySync.mockResolvedValue(undefined);
    repository.completeFoundryMerchantSync.mockResolvedValue({ accepted: 1, stale: false });
    repository.failFoundrySync.mockResolvedValue(undefined);
    repository.failFoundryMerchantSync.mockResolvedValue(undefined);
    repository.getFoundryMerchantCatalog.mockResolvedValue({
      campaignId,
      connection: { status: "online", lastSeenAt: "2026-08-23T02:00:00.000Z" },
      catalog: {
        merchantName: "Intendente da Ordem",
        syncedAt: "2026-08-23T02:00:00.000Z",
        freshness: "fresh",
        items: [],
      },
    });
    repository.pollFoundryCommands.mockResolvedValue([]);
    repository.completeFoundryCommand.mockResolvedValue("completed");
    repository.enqueueFoundryCommand.mockResolvedValue({
      commandId: "44444444-4444-4444-8444-444444444444",
      duplicate: false,
    });
    repository.listFoundryWorlds.mockResolvedValue([]);
    repository.revokeFoundryWorld.mockResolvedValue(true);
    repository.startFoundryCaptureSession.mockResolvedValue(captureSession());
    repository.listFoundryCaptureSessions.mockResolvedValue([captureSession()]);
    repository.endFoundryCaptureSession.mockResolvedValue({
      ...captureSession(),
      status: "ended",
      endedAt: "2026-08-24T20:30:00.000Z",
    });
    repository.cancelFoundryCaptureSession.mockResolvedValue({
      ...captureSession(),
      status: "cancelled",
      endedAt: "2026-08-24T20:30:00.000Z",
    });
    repository.recordFoundryChatBatch.mockResolvedValue({
      batchId: "99999999-9999-4999-8999-999999999999",
      captureSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      accepted: 1,
      ignored: 0,
      duplicate: false,
    });
    repository.getFoundryCaptureTranscript.mockResolvedValue({
      session: { ...captureSession(), status: "ended" },
      transcript: "[2026-08-24T20:00:00.000Z] Mestre: A porta cede.",
      truncated: false,
    });
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

  it("cria pareamento somente para mundos demonlord", async () => {
    const invalidSystem = await request("/v1/pairings", {
      method: "POST",
      body: JSON.stringify({ ...registrationBody(), systemId: "dnd5e" }),
    });
    expect(invalidSystem.status).toBe(400);

    const registered = await request("/v1/pairings", {
      method: "POST",
      body: JSON.stringify(registrationBody()),
    });
    const body = (await registered.json()) as {
      pairingId: string;
      deviceCode: string;
      userCode: string;
    };
    expect(registered.status).toBe(201);
    expect(body.pairingId).toBe(pairingId);
    expect(body.deviceCode).toHaveLength(43);
    expect(body.userCode).toMatch(/^LUME-/u);
    expect(repository.createFoundryPairing).toHaveBeenCalledOnce();
  });

  it("mantém a autorização no portal separada da posse do Foundry", async () => {
    const unauthenticatedPoll = await request(`/v1/pairings/${pairingId}/poll`, {
      method: "POST",
    });
    expect(unauthenticatedPoll.status).toBe(401);

    const pending = await request(`/v1/pairings/${pairingId}/poll`, {
      method: "POST",
      headers: bearer(accessToken),
    });
    expect(await pending.json()).toMatchObject({ status: "pending" });

    const unauthorizedPreview = await request("/internal/foundry/pairings/preview", {
      method: "POST",
      body: JSON.stringify({ userCode: "LUME-7K4P-9Q2M" }),
    });
    expect(unauthorizedPreview.status).toBe(401);

    const approved = await request(`/internal/foundry/pairings/${pairingId}/approve`, {
      method: "POST",
      headers: bearer(serviceToken),
      body: JSON.stringify({
        campaignId,
        campaignName: "Ordem da Última Luz",
        authorizedByUserId: "88888888-8888-4888-8888-888888888888",
      }),
    });
    expect(approved.status).toBe(200);
    expect(repository.authorizeFoundryPairing).toHaveBeenCalledOnce();
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

  it("sincroniza o catálogo sanitizado do Mercador no banco de integração", async () => {
    const sync = merchantSync();
    const response = await request(`/v1/worlds/${worldId}/merchant/sync`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify(sync),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      syncId: sync.syncId,
      accepted: 1,
      duplicate: false,
      stale: false,
    });
    expect(repository.completeFoundryMerchantSync).toHaveBeenCalledWith(
      env,
      worldId,
      campaignId,
      sync,
    );
  });

  it("protege a leitura do Mercador com o token entre serviços", async () => {
    const path = `/internal/foundry/campaigns/${campaignId}/merchant`;
    expect((await request(path)).status).toBe(401);
    const response = await request(path, { headers: bearer(serviceToken) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      campaignId,
      catalog: { merchantName: "Intendente da Ordem" },
    });
  });

  it("enfileira comandos internos com idempotência obrigatória", async () => {
    const missingKey = await request(`/internal/foundry/campaigns/${campaignId}/worlds/${worldId}/commands`, {
      method: "POST",
      headers: bearer(serviceToken),
      body: JSON.stringify({ command: { type: "actor.sync.request", payload: {} } }),
    });
    expect(missingKey.status).toBe(400);

    const response = await request(`/internal/foundry/campaigns/${campaignId}/worlds/${worldId}/commands`, {
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
      campaignId,
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

  it("recebe lotes de chat somente de um mundo autenticado", async () => {
    const body = chatBatch();
    const unauthorized = await request(`/v1/worlds/${worldId}/chat/batches`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    expect(unauthorized.status).toBe(401);

    const response = await request(`/v1/worlds/${worldId}/chat/batches`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    expect(repository.recordFoundryChatBatch).toHaveBeenCalledWith(env, worldId, body);
  });

  it("controla o ciclo da captura somente pela API interna", async () => {
    const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const path = `/internal/foundry/campaigns/${campaignId}/worlds/${worldId}/capture-sessions`;
    const unauthorized = await request(path, {
      method: "POST",
      body: JSON.stringify({ sessionId, campaignId, worldId, startedAt: "2026-08-24T20:00:00.000Z" }),
    });
    expect(unauthorized.status).toBe(401);

    const created = await request(path, {
      method: "POST",
      headers: bearer(serviceToken),
      body: JSON.stringify({ sessionId, campaignId, worldId, startedAt: "2026-08-24T20:00:00.000Z" }),
    });
    expect(created.status).toBe(201);

    const ended = await request(`${path}/${sessionId}/end`, {
      method: "POST",
      headers: bearer(serviceToken),
      body: "{}",
    });
    expect(ended.status).toBe(200);

    const transcript = await request(`${path}/${sessionId}/transcript`, {
      headers: bearer(serviceToken),
    });
    expect(transcript.status).toBe(200);
    expect(await transcript.json()).toMatchObject({ truncated: false });
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
    worldInstanceId: "33333333-3333-4333-8333-333333333333",
    foundryWorldId: "ordem-da-ultima-luz",
    worldTitle: "Ordem da Última Luz",
    systemId: "demonlord",
    foundryVersion: "14.320",
    systemVersion: "6.1.4",
    moduleVersion: "0.2.0",
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

function merchantSync() {
  return {
    syncId: "12121212-1212-4212-8212-121212121212",
    capturedAt: "2026-08-23T02:00:00.000Z",
    catalog: {
      merchantActorId: "merchant-001",
      merchantName: "Intendente da Ordem",
      sourceUpdatedAt: "2026-08-23T01:59:00.000Z",
      items: [
        {
          itemId: "item-001",
          name: "Óleo de lanterna",
          description: "Mantém uma lanterna acesa por mais tempo.",
          category: "Equipamento",
          imageUrl: null,
          price: "2 cp",
          quantity: 4,
          sourceUpdatedAt: "2026-08-23T01:59:00.000Z",
        },
      ],
    },
  };
}

function captureSession() {
  return {
    sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    campaignId,
    worldId,
    worldTitle: "Ordem da Última Luz",
    worldStatus: "online" as const,
    status: "active" as const,
    startedAt: "2026-08-24T20:00:00.000Z",
    endedAt: null,
    messageCount: 1,
    lastMessageAt: "2026-08-24T20:00:00.000Z",
  };
}

function chatBatch() {
  return {
    batchId: "99999999-9999-4999-8999-999999999999",
    capturedAt: "2026-08-24T20:00:00.000Z",
    messages: [
      {
        messageId: "chat-001",
        createdAt: "2026-08-24T20:00:00.000Z",
        authorUserId: "user-001",
        authorName: "Mestre",
        speakerActorId: null,
        speakerName: null,
        content: "A porta de ferro cede.",
        kind: "message" as const,
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
