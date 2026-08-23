import { z } from "zod";

const foundryIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

const version = z.string().min(1).max(32);
const isoDate = z.string().datetime({ offset: true });

export const FoundryWorldRegistrationRequestSchema = z
  .object({
    campaignId: z.string().uuid(),
    worldInstanceId: z.string().uuid(),
    foundryWorldId: foundryIdentifier,
    worldTitle: z.string().trim().min(1).max(120),
    systemId: z.literal("demonlord"),
    foundryVersion: version,
    systemVersion: version,
    moduleVersion: version,
  })
  .strict();

export const FoundryWorldRegistrationResponseSchema = z
  .object({
    worldId: z.string().uuid(),
    accessToken: z.string().min(43).max(128),
    heartbeatIntervalSeconds: z.number().int().min(15).max(300),
    pollIntervalSeconds: z.number().int().min(2).max(60),
  })
  .strict();

export const FoundryHeartbeatRequestSchema = z
  .object({
    observedAt: isoDate,
    activeUsers: z.number().int().min(0).max(1_000),
    actorCount: z.number().int().min(0).max(100_000),
  })
  .strict();

export const FoundryHeartbeatResponseSchema = z
  .object({
    status: z.literal("online"),
    serverTime: isoDate,
    nextHeartbeatSeconds: z.number().int().min(15).max(300),
  })
  .strict();

const nullableLabel = z.string().trim().min(1).max(120).nullable();

export const FoundryCharacterProjectionSchema = z
  .object({
    actorId: foundryIdentifier,
    name: z.string().trim().min(1).max(120),
    type: z.literal("character"),
    ownerUserIds: z.array(foundryIdentifier).max(20),
    level: z.number().int().min(0).max(20),
    ancestry: nullableLabel,
    paths: z
      .object({
        novice: nullableLabel,
        expert: nullableLabel,
        master: nullableLabel,
        legendary: nullableLabel,
      })
      .strict(),
    statistics: z
      .object({
        healthMax: z.number().int().min(0).max(100_000),
        damage: z.number().int().min(0).max(100_000),
        healingRate: z.number().int().min(0).max(100_000),
        insanity: z.number().int().min(0).max(100_000),
        corruption: z.number().int().min(0).max(100_000),
      })
      .strict(),
    sourceUpdatedAt: isoDate,
  })
  .strict();

export const FoundryCharacterSyncRequestSchema = z
  .object({
    syncId: z.string().uuid(),
    capturedAt: isoDate,
    characters: z.array(FoundryCharacterProjectionSchema).max(200),
  })
  .strict();

export const FoundryCharacterSyncCallbackSchema = FoundryCharacterSyncRequestSchema.extend({
  worldId: z.string().uuid(),
  campaignId: z.string().uuid(),
}).strict();

export const FoundryCharacterSyncResponseSchema = z
  .object({
    syncId: z.string().uuid(),
    accepted: z.number().int().nonnegative(),
    duplicate: z.boolean(),
    stale: z.boolean(),
  })
  .strict();

export const FoundryCommandTypeSchema = z.enum([
  "actor.sync.request",
  "chat.message.create",
]);

const ActorSyncCommandSchema = z
  .object({
    type: z.literal("actor.sync.request"),
    payload: z.object({}).strict(),
  })
  .strict();

const ChatMessageCommandSchema = z
  .object({
    type: z.literal("chat.message.create"),
    payload: z
      .object({
        content: z.string().trim().min(1).max(2_000),
        speakerActorId: foundryIdentifier.nullable().default(null),
        whisperUserIds: z.array(foundryIdentifier).max(20).default([]),
      })
      .strict(),
  })
  .strict();

export const FoundryCommandInputSchema = z.discriminatedUnion("type", [
  ActorSyncCommandSchema,
  ChatMessageCommandSchema,
]);

export const FoundryCommandCreateRequestSchema = z
  .object({
    command: FoundryCommandInputSchema,
    availableAt: isoDate.optional(),
    expiresAt: isoDate.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.availableAt ||
      !value.expiresAt ||
      Date.parse(value.expiresAt) > Date.parse(value.availableAt),
    { message: "expiresAt must be after availableAt", path: ["expiresAt"] },
  );

export const FoundryCommandSchema = FoundryCommandInputSchema.and(
  z
    .object({
      id: z.string().uuid(),
      deliveryToken: z.string().uuid(),
      createdAt: isoDate,
      expiresAt: isoDate.nullable(),
    })
    .strict(),
);

export const FoundryCommandPollRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();

const commandResultValue = z.union([
  z.string().max(1_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const FoundryCommandResultRequestSchema = z
  .object({
    deliveryToken: z.string().uuid(),
    outcome: z.enum(["succeeded", "failed"]),
    result: z.record(z.string().max(64), commandResultValue).default({}),
    error: z.string().max(1_000).nullable().default(null),
  })
  .strict()
  .refine(
    (value) => value.outcome === "failed" || value.error === null,
    { message: "error is only allowed for failed commands", path: ["error"] },
  );

export const FoundryWorldStatusSchema = z
  .object({
    worldId: z.string().uuid(),
    campaignId: z.string().uuid(),
    worldTitle: z.string(),
    foundryWorldId: z.string(),
    foundryVersion: z.string(),
    systemVersion: z.string(),
    moduleVersion: z.string(),
    status: z.enum(["online", "offline", "revoked"]),
    lastSeenAt: isoDate.nullable(),
    activeUsers: z.number().int().nonnegative(),
    actorCount: z.number().int().nonnegative(),
  })
  .strict();

export type FoundryWorldRegistrationRequest = z.infer<
  typeof FoundryWorldRegistrationRequestSchema
>;
export type FoundryWorldRegistrationResponse = z.infer<
  typeof FoundryWorldRegistrationResponseSchema
>;
export type FoundryHeartbeatRequest = z.infer<typeof FoundryHeartbeatRequestSchema>;
export type FoundryCharacterProjection = z.infer<
  typeof FoundryCharacterProjectionSchema
>;
export type FoundryCharacterSyncRequest = z.infer<
  typeof FoundryCharacterSyncRequestSchema
>;
export type FoundryCharacterSyncCallback = z.infer<
  typeof FoundryCharacterSyncCallbackSchema
>;
export type FoundryCommandInput = z.infer<typeof FoundryCommandInputSchema>;
export type FoundryCommandCreateRequest = z.infer<
  typeof FoundryCommandCreateRequestSchema
>;
export type FoundryCommand = z.infer<typeof FoundryCommandSchema>;
export type FoundryCommandResultRequest = z.infer<
  typeof FoundryCommandResultRequestSchema
>;
export type FoundryWorldStatus = z.infer<typeof FoundryWorldStatusSchema>;
