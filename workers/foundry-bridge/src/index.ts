import { Hono } from "hono";
import { cors } from "hono/cors";
import { z, type ZodType } from "zod";
import {
  FoundryCaptureSessionListResponseSchema,
  FoundryCaptureSessionSchema,
  FoundryCaptureSessionStartRequestSchema,
  FoundryCaptureTranscriptSchema,
  FoundryCharacterSyncRequestSchema,
  FoundryChatBatchRequestSchema,
  FoundryChatBatchResponseSchema,
  FoundryCommandCreateRequestSchema,
  FoundryCommandPollRequestSchema,
  FoundryCommandResultRequestSchema,
  FoundryHeartbeatRequestSchema,
  FoundryHeartbeatResponseSchema,
  FoundryMerchantSyncRequestSchema,
  FoundryMerchantSyncResponseSchema,
  FoundryMerchantPurchaseContextSchema,
  MerchantCatalogResponseSchema,
  FoundryPairingApprovalRequestSchema,
  FoundryPairingApprovalResponseSchema,
  FoundryPairingCreateRequestSchema,
  FoundryPairingCreateResponseSchema,
  FoundryPairingPollResponseSchema,
  FoundryPairingPreviewSchema,
  FoundryUserCodeSchema,
  FoundryWorldStatusSchema,
  parsePatchOutcomes,
} from "@ordem/contracts";
import {
  assertStaticBearer,
  authenticateWorld,
  bearerToken,
  FoundryBridgeError,
  generateAccessToken,
  hashToken,
} from "./auth";
import {
  reportCharacterNotesDelivery,
  reportSedeGrantDelivery,
  reportCreatureDelivery,
  reportMerchantPurchaseDelivery,
  reportMerchantStockDelivery,
  reportMerchantStockPatchDelivery,
  syncCharactersWithPortal,
} from "./portal-client";
import {
  authorizeFoundryPairing,
  cancelFoundryCaptureSession,
  cancelFoundryPairing,
  claimFoundryMerchantSync,
  claimFoundrySync,
  completeFoundryCommand,
  completeFoundryMerchantSync,
  completeFoundrySync,
  createFoundryPairing,
  enqueueFoundryCommand,
  failFoundrySync,
  failFoundryMerchantSync,
  getFoundryMerchantCatalog,
  getFoundryMerchantPurchaseContext,
  getFoundryCaptureTranscript,
  endFoundryCaptureSession,
  listFoundryCaptureSessions,
  listFoundryWorlds,
  pollFoundryPairing,
  pollFoundryCommands,
  previewFoundryPairing,
  recordHeartbeat,
  recordFoundryChatBatch,
  purgeExpiredFoundryChatEvents,
  revokeFoundryWorld,
  startFoundryCaptureSession,
} from "./repository";
import { HEARTBEAT_SECONDS } from "./presence";
import type { FoundryEnv } from "./types";

const POLL_SECONDS = 5;
const PAIRING_TTL_SECONDS = 10 * 60;
const uuid = z.string().uuid();

const foundryApp = new Hono<{ Bindings: FoundryEnv }>();

foundryApp.use(
  "/v1/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "X-Correlation-Id",
    ],
    maxAge: 86_400,
  }),
);

foundryApp.get("/health", async (context) => {
  await context.env.INTEGRATION_DB.prepare("SELECT 1 AS healthy").first();
  return context.json({ service: "foundry-bridge", status: "ok" });
});

foundryApp.get("/openapi.json", (context) =>
  context.json({
    openapi: "3.1.0",
    info: { title: "Ordem Foundry Bridge API", version: "0.4.0" },
    paths: {
      "/health": { get: { responses: { 200: { description: "Healthy" } } } },
      "/v1/pairings": {
        post: { responses: { 201: { description: "Pairing started" } } },
      },
      "/v1/pairings/{pairingId}/poll": {
        post: { responses: { 200: { description: "Pairing status" } } },
      },
      "/v1/worlds/{worldId}/heartbeat": {
        post: { responses: { 200: { description: "Heartbeat accepted" } } },
      },
      "/v1/worlds/{worldId}/characters/sync": {
        post: { responses: { 200: { description: "Projection synchronized" } } },
      },
      "/v1/worlds/{worldId}/merchant/sync": {
        post: { responses: { 200: { description: "Merchant catalog synchronized" } } },
      },
      "/v1/worlds/{worldId}/chat/batches": {
        post: { responses: { 200: { description: "Public chat batch accepted" } } },
      },
      "/v1/worlds/{worldId}/commands/poll": {
        post: { responses: { 200: { description: "Leased commands" } } },
      },
      "/v1/worlds/{worldId}/commands/{commandId}/result": {
        post: { responses: { 200: { description: "Command result accepted" } } },
      },
    },
  }),
);

foundryApp.post("/v1/pairings", async (context) => {
  const input = await parseJson(context.req.raw, FoundryPairingCreateRequestSchema);
  const deviceCode = generateAccessToken();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_SECONDS * 1_000).toISOString();
  const pairingId = await createFoundryPairing(
    context.env,
    input,
    await hashToken(deviceCode),
    await hashToken(normalizeUserCode(userCode)),
    await hashToken(
      `pairing-request:${context.req.header("CF-Connecting-IP") ?? "local-development"}`,
    ),
    expiresAt,
  );
  const verificationUri = new URL(
    "/foundry/connect",
    context.env.PORTAL_URL ?? "https://ordem-da-ultima-luz.ordem-da-ultima-luz.workers.dev",
  );
  const verificationUriComplete = new URL(verificationUri);
  verificationUriComplete.searchParams.set("code", userCode);
  return context.json(
    FoundryPairingCreateResponseSchema.parse({
      pairingId,
      deviceCode,
      userCode,
      verificationUri: verificationUri.toString(),
      verificationUriComplete: verificationUriComplete.toString(),
      expiresAt,
      pollIntervalSeconds: POLL_SECONDS,
    }),
    201,
  );
});

foundryApp.post("/v1/pairings/:pairingId/poll", async (context) => {
  const pairingId = parseUuid(context.req.param("pairingId"));
  const deviceCode = bearerToken(context.req.raw);
  if (deviceCode.length < 43) {
    throw new FoundryBridgeError(401, "invalid_pairing_device", "Solicitação não autorizada.");
  }
  const accessToken = generateAccessToken();
  const pairing = await pollFoundryPairing(
    context.env,
    pairingId,
    await hashToken(deviceCode),
    await hashToken(accessToken),
    accessToken.slice(0, 8),
  );
  if (!pairing) {
    throw new FoundryBridgeError(401, "invalid_pairing_device", "Solicitação não autorizada.");
  }
  if (pairing.status === "expired") {
    throw new FoundryBridgeError(409, "pairing_expired", "Este código expirou.");
  }
  if (pairing.status === "cancelled") {
    throw new FoundryBridgeError(409, "pairing_cancelled", "Esta solicitação foi cancelada.");
  }
  if (pairing.status === "authorized") {
    if (!pairing.worldId || !pairing.campaignId || !pairing.campaignName) {
      throw new FoundryBridgeError(503, "pairing_finalizing", "A conexão está sendo finalizada.");
    }
    return context.json(
      FoundryPairingPollResponseSchema.parse({
        status: "authorized",
        worldId: pairing.worldId,
        campaignId: pairing.campaignId,
        campaignName: pairing.campaignName,
        accessToken,
        heartbeatIntervalSeconds: HEARTBEAT_SECONDS,
        pollIntervalSeconds: POLL_SECONDS,
      }),
    );
  }
  return context.json(
    FoundryPairingPollResponseSchema.parse({
      status: "pending",
      expiresAt: pairing.expiresAt,
      pollIntervalSeconds: POLL_SECONDS,
    }),
  );
});

foundryApp.delete("/v1/pairings/:pairingId", async (context) => {
  const pairingId = parseUuid(context.req.param("pairingId"));
  const deviceCode = bearerToken(context.req.raw);
  if (
    deviceCode.length < 43 ||
    !(await cancelFoundryPairing(context.env, pairingId, await hashToken(deviceCode)))
  ) {
    throw new FoundryBridgeError(409, "pairing_unavailable", "Esta solicitação não está mais disponível.");
  }
  return context.body(null, 204);
});

foundryApp.post("/v1/worlds/:worldId/heartbeat", async (context) => {
  const worldId = parseUuid(context.req.param("worldId"));
  await authenticateWorld(context.req.raw, context.env, worldId);
  const input = await parseJson(context.req.raw, FoundryHeartbeatRequestSchema);
  await recordHeartbeat(context.env, worldId, input);
  return context.json(
    FoundryHeartbeatResponseSchema.parse({
      status: "online",
      serverTime: new Date().toISOString(),
      nextHeartbeatSeconds: HEARTBEAT_SECONDS,
    }),
  );
});

foundryApp.post("/v1/worlds/:worldId/revoke", async (context) => {
  const worldId = parseUuid(context.req.param("worldId"));
  await authenticateWorld(context.req.raw, context.env, worldId);
  if (!(await revokeFoundryWorld(context.env, worldId))) {
    throw new FoundryBridgeError(404, "world_not_found", "Mundo não encontrado.");
  }
  return context.json({ worldId, revoked: true });
});

foundryApp.post("/v1/worlds/:worldId/characters/sync", async (context) => {
  const worldId = parseUuid(context.req.param("worldId"));
  const world = await authenticateWorld(context.req.raw, context.env, worldId);
  const input = await parseJson(context.req.raw, FoundryCharacterSyncRequestSchema);
  const claim = await claimFoundrySync(context.env, worldId, input.syncId);
  if (claim === "succeeded") {
    return context.json({
      syncId: input.syncId,
      accepted: 0,
      duplicate: true,
      stale: false,
    });
  }
  if (claim === "processing") {
    throw new FoundryBridgeError(
      409,
      "sync_in_progress",
      "Esta sincronização já está em processamento.",
    );
  }

  const correlationId = requestCorrelationId(context.req.raw);
  try {
    const result = await syncCharactersWithPortal(
      context.env,
      {
        ...input,
        worldId,
        campaignId: world.campaignId,
      },
      correlationId,
    );
    await completeFoundrySync(
      context.env,
      worldId,
      input.syncId,
      result.stale ? [] : input.characters,
    );
    return context.json(result);
  } catch (error) {
    await failFoundrySync(context.env, worldId, input.syncId, error).catch(
      () => undefined,
    );
    throw error;
  }
});

foundryApp.post("/v1/worlds/:worldId/merchant/sync", async (context) => {
  const worldId = parseUuid(context.req.param("worldId"));
  const world = await authenticateWorld(context.req.raw, context.env, worldId);
  const input = await parseJson(context.req.raw, FoundryMerchantSyncRequestSchema);
  const claim = await claimFoundryMerchantSync(context.env, worldId, input.syncId);
  if (claim === "succeeded") {
    return context.json(
      FoundryMerchantSyncResponseSchema.parse({
        syncId: input.syncId,
        accepted: 0,
        duplicate: true,
        stale: false,
      }),
    );
  }
  if (claim === "processing") {
    throw new FoundryBridgeError(
      409,
      "merchant_sync_in_progress",
      "Esta sincronização do Lojista já está em processamento.",
    );
  }

  try {
    const result = await completeFoundryMerchantSync(
      context.env,
      worldId,
      world.campaignId,
      input,
    );
    return context.json(
      FoundryMerchantSyncResponseSchema.parse({
        syncId: input.syncId,
        accepted: result.accepted,
        duplicate: false,
        stale: result.stale,
      }),
    );
  } catch (error) {
    await failFoundryMerchantSync(
      context.env,
      worldId,
      input.syncId,
      error,
    ).catch(() => undefined);
    throw error;
  }
});

foundryApp.post("/v1/worlds/:worldId/chat/batches", async (context) => {
  const worldId = parseUuid(context.req.param("worldId"));
  await authenticateWorld(context.req.raw, context.env, worldId);
  const input = await parseJson(context.req.raw, FoundryChatBatchRequestSchema);
  return context.json(
    FoundryChatBatchResponseSchema.parse(
      await recordFoundryChatBatch(context.env, worldId, input),
    ),
  );
});

foundryApp.post("/v1/worlds/:worldId/commands/poll", async (context) => {
  const worldId = parseUuid(context.req.param("worldId"));
  await authenticateWorld(context.req.raw, context.env, worldId);
  const input = await parseJson(context.req.raw, FoundryCommandPollRequestSchema);
  return context.json({ commands: await pollFoundryCommands(context.env, worldId, input.limit) });
});

foundryApp.post(
  "/v1/worlds/:worldId/commands/:commandId/result",
  async (context) => {
    const worldId = parseUuid(context.req.param("worldId"));
    const commandId = parseUuid(context.req.param("commandId"));
    await authenticateWorld(context.req.raw, context.env, worldId);
    const input = await parseJson(context.req.raw, FoundryCommandResultRequestSchema);
    const completion = await completeFoundryCommand(
      context.env,
      worldId,
      commandId,
      input,
    );
    if (completion.command.type === "merchant.purchase.request") {
      await reportMerchantPurchaseDelivery(
        context.env,
        {
          requestId: completion.command.payload.requestId,
          commandId,
          outcome: input.outcome,
          error: input.outcome === "failed" ? input.error : null,
          deliveredAt: new Date().toISOString(),
        },
        requestCorrelationId(context.req.raw),
      );
    }
    if (completion.command.type === "merchant.stock.replace") {
      await reportMerchantStockDelivery(
        context.env,
        {
          drawId: completion.command.payload.drawId,
          commandId,
          outcome: input.outcome,
          error: input.outcome === "failed" ? input.error : null,
          deliveredAt: new Date().toISOString(),
        },
        requestCorrelationId(context.req.raw),
      );
    }
    if (completion.command.type === "merchant.stock.patch") {
      await reportMerchantStockPatchDelivery(
        context.env,
        {
          patchId: completion.command.payload.patchId,
          commandId,
          outcome: input.outcome,
          outcomes: input.outcome === "succeeded" ? parsePatchOutcomes(input.result.statuses) : [],
          error: input.outcome === "failed" ? input.error : null,
          deliveredAt: new Date().toISOString(),
        },
        requestCorrelationId(context.req.raw),
      );
    }
    if (completion.command.type === "creature.upsert") {
      const actorId = input.result.actorId;
      await reportCreatureDelivery(
        context.env,
        {
          creatureId: completion.command.payload.creatureId,
          version: completion.command.payload.version,
          commandId,
          outcome: input.outcome,
          actorId: input.outcome === "succeeded" && typeof actorId === "string" ? actorId.slice(0, 128) : null,
          error: input.outcome === "failed" ? input.error : null,
          deliveredAt: new Date().toISOString(),
        },
        requestCorrelationId(context.req.raw),
      );
    }
    if (completion.command.type === "character.notes.update") {
      await reportCharacterNotesDelivery(
        context.env,
        {
          updateId: completion.command.payload.updateId,
          commandId,
          outcome: input.outcome,
          conflict: input.outcome === "succeeded" && input.result.conflict === true,
          error: input.outcome === "failed" ? input.error : null,
          deliveredAt: new Date().toISOString(),
        },
        requestCorrelationId(context.req.raw),
      );
    }
    if (completion.command.type === "character.items.grant") {
      await reportSedeGrantDelivery(
        context.env,
        {
          declarationId: completion.command.payload.grantId,
          commandId,
          outcome: input.outcome,
          error: input.outcome === "failed" ? input.error : null,
          deliveredAt: new Date().toISOString(),
        },
        requestCorrelationId(context.req.raw),
      );
    }
    return context.json({ commandId, disposition: completion.disposition });
  },
);

foundryApp.post("/internal/foundry/pairings/preview", async (context) => {
  await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
  const input = await parseJson(
    context.req.raw,
    z.object({ userCode: FoundryUserCodeSchema }).strict(),
  );
  const normalizedCode = normalizeUserCode(input.userCode);
  const pairing = await previewFoundryPairing(
    context.env,
    await hashToken(normalizedCode),
    input.userCode,
  );
  if (!pairing) {
    throw new FoundryBridgeError(404, "pairing_not_found", "Solicitação não encontrada.");
  }
  return context.json(FoundryPairingPreviewSchema.parse(pairing));
});

foundryApp.post("/internal/foundry/pairings/:pairingId/approve", async (context) => {
  await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
  const pairingId = parseUuid(context.req.param("pairingId"));
  const input = await parseJson(context.req.raw, FoundryPairingApprovalRequestSchema);
  const result = await authorizeFoundryPairing(context.env, pairingId, input);
  return context.json(
    FoundryPairingApprovalResponseSchema.parse({
      pairingId,
      worldId: result.worldId,
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      status: "authorized",
    }),
  );
});

foundryApp.get("/internal/foundry/campaigns/:campaignId/worlds", async (context) => {
  await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
  const campaignId = parseUuid(context.req.param("campaignId"));
  const worlds = await listFoundryWorlds(context.env, campaignId);
  return context.json({ worlds: worlds.map((world) => FoundryWorldStatusSchema.parse(world)) });
});

foundryApp.get(
  "/internal/foundry/campaigns/:campaignId/merchant",
  async (context) => {
    await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
    const campaignId = parseUuid(context.req.param("campaignId"));
    return context.json(
      MerchantCatalogResponseSchema.parse(
        await getFoundryMerchantCatalog(context.env, campaignId),
      ),
    );
  },
);

foundryApp.get(
  "/internal/foundry/campaigns/:campaignId/worlds/:worldId/merchant/purchase-context",
  async (context) => {
    await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
    const campaignId = parseUuid(context.req.param("campaignId"));
    const worldId = parseUuid(context.req.param("worldId"));
    return context.json(
      FoundryMerchantPurchaseContextSchema.parse(
        await getFoundryMerchantPurchaseContext(context.env, campaignId, worldId),
      ),
    );
  },
);

foundryApp.get(
  "/internal/foundry/campaigns/:campaignId/capture-sessions",
  async (context) => {
    await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
    const campaignId = parseUuid(context.req.param("campaignId"));
    return context.json(
      FoundryCaptureSessionListResponseSchema.parse({
        data: await listFoundryCaptureSessions(context.env, campaignId),
      }),
    );
  },
);

foundryApp.post(
  "/internal/foundry/campaigns/:campaignId/worlds/:worldId/capture-sessions",
  async (context) => {
    await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
    const campaignId = parseUuid(context.req.param("campaignId"));
    const worldId = parseUuid(context.req.param("worldId"));
    const input = await parseJson(context.req.raw, FoundryCaptureSessionStartRequestSchema);
    if (input.campaignId !== campaignId || input.worldId !== worldId) {
      throw new FoundryBridgeError(400, "capture_scope_mismatch", "Escopo da sessão inválido.");
    }
    return context.json(
      FoundryCaptureSessionSchema.parse(
        await startFoundryCaptureSession(context.env, input),
      ),
      201,
    );
  },
);

foundryApp.post(
  "/internal/foundry/campaigns/:campaignId/worlds/:worldId/capture-sessions/:sessionId/end",
  async (context) => {
    await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
    const campaignId = parseUuid(context.req.param("campaignId"));
    const worldId = parseUuid(context.req.param("worldId"));
    const sessionId = parseUuid(context.req.param("sessionId"));
    return context.json(
      FoundryCaptureSessionSchema.parse(
        await endFoundryCaptureSession(
          context.env,
          campaignId,
          worldId,
          sessionId,
        ),
      ),
    );
  },
);

foundryApp.delete(
  "/internal/foundry/campaigns/:campaignId/worlds/:worldId/capture-sessions/:sessionId",
  async (context) => {
    await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
    const campaignId = parseUuid(context.req.param("campaignId"));
    const worldId = parseUuid(context.req.param("worldId"));
    const sessionId = parseUuid(context.req.param("sessionId"));
    return context.json(
      FoundryCaptureSessionSchema.parse(
        await cancelFoundryCaptureSession(
          context.env,
          campaignId,
          worldId,
          sessionId,
        ),
      ),
    );
  },
);

foundryApp.get(
  "/internal/foundry/campaigns/:campaignId/worlds/:worldId/capture-sessions/:sessionId/transcript",
  async (context) => {
    await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
    const campaignId = parseUuid(context.req.param("campaignId"));
    const worldId = parseUuid(context.req.param("worldId"));
    const sessionId = parseUuid(context.req.param("sessionId"));
    const result = await getFoundryCaptureTranscript(
      context.env,
      campaignId,
      worldId,
      sessionId,
    );
    return context.json(
      FoundryCaptureTranscriptSchema.parse({
        ...result.session,
        transcript: result.transcript,
        truncated: result.truncated,
      }),
    );
  },
);

foundryApp.delete("/internal/foundry/campaigns/:campaignId/worlds/:worldId", async (context) => {
  await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
  const campaignId = parseUuid(context.req.param("campaignId"));
  const worldId = parseUuid(context.req.param("worldId"));
  if (!(await revokeFoundryWorld(context.env, worldId, campaignId))) {
    throw new FoundryBridgeError(404, "world_not_found", "Mundo não encontrado.");
  }
  return context.json({ worldId, revoked: true });
});

foundryApp.post(
  "/internal/foundry/campaigns/:campaignId/worlds/:worldId/commands",
  async (context) => {
    await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
    const campaignId = parseUuid(context.req.param("campaignId"));
    const worldId = parseUuid(context.req.param("worldId"));
    const idempotencyKey = context.req.header("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9:._-]{8,128}$/u.test(idempotencyKey)) {
      throw new FoundryBridgeError(
        400,
        "invalid_idempotency_key",
        "Idempotency-Key é obrigatório.",
      );
    }
    const input = await parseJson(context.req.raw, FoundryCommandCreateRequestSchema);
    const result = await enqueueFoundryCommand(
      context.env,
      worldId,
      idempotencyKey,
      input,
      campaignId,
    );
    return context.json(result, result.duplicate ? 200 : 201);
  },
);

foundryApp.onError((error, context) => {
  if (error instanceof FoundryBridgeError) {
    return context.json({ error: error.code, message: error.message }, error.status);
  }
  console.error(
    JSON.stringify({
      level: "error",
      code: "foundry_bridge_request_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  return context.json(
    { error: "internal_error", message: "Não foi possível concluir a operação." },
    500,
  );
});

async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new FoundryBridgeError(400, "invalid_json", "Corpo JSON inválido.");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FoundryBridgeError(400, "invalid_request", "Dados inválidos.");
  }
  return parsed.data;
}

function parseUuid(value: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) {
    throw new FoundryBridgeError(404, "world_not_found", "Recurso não encontrado.");
  }
  return parsed.data;
}

function requestCorrelationId(request: Request): string {
  const candidate = request.headers.get("x-correlation-id");
  return candidate && uuid.safeParse(candidate).success ? candidate : crypto.randomUUID();
}

function generateUserCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `LUME-${value.slice(0, 4)}-${value.slice(4)}`;
}

function normalizeUserCode(value: string): string {
  return value.trim().toUpperCase();
}

export { foundryApp };
export default {
  fetch: foundryApp.fetch,
  scheduled(_controller, env, context) {
    context.waitUntil(
      purgeExpiredFoundryChatEvents(env).then((deleted) => {
        console.log(JSON.stringify({ event: "foundry_chat_retention", deleted }));
      }),
    );
  },
} satisfies ExportedHandler<FoundryEnv>;
