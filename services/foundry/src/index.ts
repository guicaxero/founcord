import { Hono } from "hono";
import { cors } from "hono/cors";
import { z, type ZodType } from "zod";
import {
  FoundryCharacterSyncRequestSchema,
  FoundryCommandCreateRequestSchema,
  FoundryCommandPollRequestSchema,
  FoundryCommandResultRequestSchema,
  FoundryHeartbeatRequestSchema,
  FoundryHeartbeatResponseSchema,
  FoundryWorldRegistrationRequestSchema,
  FoundryWorldRegistrationResponseSchema,
  FoundryWorldStatusSchema,
} from "@vigilia/contracts";
import {
  assertStaticBearer,
  authenticateWorld,
  bearerToken,
  FoundryBridgeError,
  generateAccessToken,
  hashToken,
} from "./auth";
import { syncCharactersWithPortal } from "./portal-client";
import {
  claimFoundrySync,
  claimFoundryEnrollment,
  completeFoundryCommand,
  completeFoundryEnrollment,
  completeFoundrySync,
  enqueueFoundryCommand,
  failFoundrySync,
  listFoundryWorlds,
  pollFoundryCommands,
  recordHeartbeat,
  registerFoundryWorld,
  revokeFoundryWorld,
} from "./repository";
import type { FoundryEnv } from "./types";

const HEARTBEAT_SECONDS = 30;
const POLL_SECONDS = 5;
const uuid = z.string().uuid();

const foundryApp = new Hono<{ Bindings: FoundryEnv }>();

foundryApp.use(
  "/v1/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "OPTIONS"],
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
    info: { title: "Ordem Foundry Bridge API", version: "0.1.0" },
    paths: {
      "/health": { get: { responses: { 200: { description: "Healthy" } } } },
      "/v1/worlds/register": {
        post: { responses: { 201: { description: "World registered" } } },
      },
      "/v1/worlds/{worldId}/heartbeat": {
        post: { responses: { 200: { description: "Heartbeat accepted" } } },
      },
      "/v1/worlds/{worldId}/characters/sync": {
        post: { responses: { 200: { description: "Projection synchronized" } } },
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

foundryApp.post("/v1/worlds/register", async (context) => {
  await assertStaticBearer(context.req.raw, context.env.FOUNDRY_ENROLLMENT_TOKEN);
  const input = await parseJson(context.req.raw, FoundryWorldRegistrationRequestSchema);
  const enrollmentTokenHash = await hashToken(bearerToken(context.req.raw));
  if (!(await claimFoundryEnrollment(context.env, enrollmentTokenHash))) {
    throw new FoundryBridgeError(
      409,
      "enrollment_token_used",
      "Este token de registro já foi utilizado. Solicite um novo token.",
    );
  }
  const accessToken = generateAccessToken();
  const worldId = await registerFoundryWorld(
    context.env,
    input,
    await hashToken(accessToken),
    accessToken.slice(0, 8),
  );
  await completeFoundryEnrollment(context.env, enrollmentTokenHash, worldId);
  return context.json(
    FoundryWorldRegistrationResponseSchema.parse({
      worldId,
      accessToken,
      heartbeatIntervalSeconds: HEARTBEAT_SECONDS,
      pollIntervalSeconds: POLL_SECONDS,
    }),
    201,
  );
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
    const disposition = await completeFoundryCommand(
      context.env,
      worldId,
      commandId,
      input,
    );
    return context.json({ commandId, disposition });
  },
);

foundryApp.get("/internal/foundry/worlds", async (context) => {
  await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
  const worlds = await listFoundryWorlds(context.env);
  return context.json({ worlds: worlds.map((world) => FoundryWorldStatusSchema.parse(world)) });
});

foundryApp.delete("/internal/foundry/worlds/:worldId", async (context) => {
  await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
  const worldId = parseUuid(context.req.param("worldId"));
  if (!(await revokeFoundryWorld(context.env, worldId))) {
    throw new FoundryBridgeError(404, "world_not_found", "Mundo não encontrado.");
  }
  return context.json({ worldId, revoked: true });
});

foundryApp.post("/internal/foundry/worlds/:worldId/commands", async (context) => {
  await assertStaticBearer(context.req.raw, context.env.INTEGRATION_SERVICE_TOKEN);
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
  );
  return context.json(result, result.duplicate ? 200 : 201);
});

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

export { foundryApp };
export default foundryApp;
