import { z } from "zod";
import { CampaignSchema } from "./campaigns";
import { foundryImageSchema } from "./common";
import { CreatureDraftSchema } from "./creatures";
import { DemonLordCoinsSchema } from "./currency";
import { MerchantStockEntrySchema } from "./merchant-stock";

const foundryIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

const version = z.string().min(1).max(32);
const isoDate = z.string().datetime({ offset: true });

export const FoundryWorldIdentitySchema = z
  .object({
    worldInstanceId: z.string().uuid(),
    foundryWorldId: foundryIdentifier,
    worldTitle: z.string().trim().min(1).max(120),
    systemId: z.literal("demonlord"),
    foundryVersion: version,
    systemVersion: version,
    moduleVersion: version,
  })
  .strict();

export const FoundryPairingCreateRequestSchema = FoundryWorldIdentitySchema;

export const FoundryUserCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^LUME-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);

export const FoundryPairingCreateResponseSchema = z
  .object({
    pairingId: z.string().uuid(),
    deviceCode: z.string().min(43).max(128),
    userCode: FoundryUserCodeSchema,
    verificationUri: z.string().url(),
    verificationUriComplete: z.string().url(),
    expiresAt: isoDate,
    pollIntervalSeconds: z.number().int().min(2).max(60),
  })
  .strict();

export const FoundryPairingPollResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("pending"),
      expiresAt: isoDate,
      pollIntervalSeconds: z.number().int().min(2).max(60),
    })
    .strict(),
  z
    .object({
      status: z.literal("authorized"),
      worldId: z.string().uuid(),
      campaignId: z.string().uuid(),
      campaignName: z.string().trim().min(1).max(100),
      accessToken: z.string().min(43).max(128),
      heartbeatIntervalSeconds: z.number().int().min(15).max(300),
      pollIntervalSeconds: z.number().int().min(2).max(60),
    })
    .strict(),
]);

export const FoundryPairingPreviewSchema = FoundryWorldIdentitySchema.extend({
  pairingId: z.string().uuid(),
  userCode: FoundryUserCodeSchema,
  status: z.enum(["pending", "authorized", "cancelled", "expired"]),
  expiresAt: isoDate,
}).strict();

export const FoundryPairingApprovalRequestSchema = z
  .object({
    campaignId: z.string().uuid(),
    campaignName: z.string().trim().min(3).max(100),
    authorizedByUserId: z.string().uuid(),
  })
  .strict();

export const FoundryPairingApprovalResponseSchema = z
  .object({
    pairingId: z.string().uuid(),
    worldId: z.string().uuid(),
    campaignId: z.string().uuid(),
    campaignName: z.string().trim().min(3).max(100),
    status: z.literal("authorized"),
  })
  .strict();

const reportedVersion = z.string().trim().min(1).max(40).optional();

/**
 * Heartbeat do módulo. As versões são opcionais (módulos anteriores ao 0.8.1
 * não as enviam) e mantêm o registro do mundo atualizado depois de uma
 * atualização do Foundry, do sistema ou do próprio módulo.
 */
export const FoundryHeartbeatRequestSchema = z
  .object({
    observedAt: isoDate,
    activeUsers: z.number().int().min(0).max(1_000),
    actorCount: z.number().int().min(0).max(100_000),
    foundryVersion: reportedVersion,
    systemVersion: reportedVersion,
    moduleVersion: reportedVersion,
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

/** Retrato ou token do personagem: HTTPS ou miniatura gerada pelo módulo. */
export const CharacterImageSchema = foundryImageSchema(60_000);

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
    /** Opcional para aceitar o módulo 0.5.x, que não envia o saldo. */
    wealth: DemonLordCoinsSchema.optional(),
    /**
     * Retrato (`actor.img`) e token (`prototypeToken.texture.src`), a partir do
     * módulo 0.9.0. Ausente = módulo antigo, e o portal mantém o que já tinha;
     * `null` = o personagem não tem essa imagem.
     */
    portraitUrl: CharacterImageSchema.nullable().optional(),
    tokenUrl: CharacterImageSchema.nullable().optional(),
    sourceUpdatedAt: isoDate,
  })
  .strict();

/** Soma máxima das imagens de uma sincronização de personagens, em caracteres. */
export const MAX_CHARACTER_SYNC_IMAGE_CHARS = 1_500_000;

export const FoundryCharacterSyncRequestSchema = z
  .object({
    syncId: z.string().uuid(),
    capturedAt: isoDate,
    characters: z
      .array(FoundryCharacterProjectionSchema)
      .max(200)
      .refine(
        (characters) =>
          characters.reduce(
            (total, character) => total + (character.portraitUrl?.length ?? 0) + (character.tokenUrl?.length ?? 0),
            0,
          ) <= MAX_CHARACTER_SYNC_IMAGE_CHARS,
        { message: "As imagens dos personagens excedem o limite total." },
      ),
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

export const FoundryChatEntrySchema = z
  .object({
    messageId: foundryIdentifier,
    createdAt: isoDate,
    authorUserId: foundryIdentifier.nullable(),
    authorName: z.string().trim().min(1).max(120),
    speakerActorId: foundryIdentifier.nullable(),
    speakerName: z.string().trim().min(1).max(120).nullable(),
    content: z.string().trim().min(1).max(4_000),
    kind: z.enum(["message", "roll"]),
  })
  .strict();

export const FoundryChatBatchRequestSchema = z
  .object({
    batchId: z.string().uuid(),
    capturedAt: isoDate,
    messages: z.array(FoundryChatEntrySchema).min(1).max(50),
  })
  .strict();

export const FoundryChatBatchResponseSchema = z
  .object({
    batchId: z.string().uuid(),
    captureSessionId: z.string().uuid().nullable(),
    accepted: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
    duplicate: z.boolean(),
  })
  .strict();

export const FoundryCaptureSessionStartRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    campaignId: z.string().uuid(),
    worldId: z.string().uuid(),
    startedAt: isoDate,
  })
  .strict();

export const FoundryCaptureSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    campaignId: z.string().uuid(),
    worldId: z.string().uuid(),
    worldTitle: z.string().trim().min(1).max(120),
    worldStatus: z.enum(["online", "offline", "revoked"]),
    status: z.enum(["active", "ended", "cancelled"]),
    startedAt: isoDate,
    endedAt: isoDate.nullable(),
    messageCount: z.number().int().nonnegative(),
    lastMessageAt: isoDate.nullable(),
  })
  .strict();

export const FoundryCaptureSessionListResponseSchema = z
  .object({ data: z.array(FoundryCaptureSessionSchema) })
  .strict();

export const FoundryCaptureTranscriptSchema = FoundryCaptureSessionSchema.extend({
  transcript: z.string().max(40_000),
  truncated: z.boolean(),
}).strict();

export const FoundryCommandTypeSchema = z.enum([
  "actor.sync.request",
  "chat.message.create",
  "merchant.purchase.request",
  "merchant.stock.replace",
  "creature.upsert",
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

const MerchantPurchaseRequestCommandSchema = z
  .object({
    type: z.literal("merchant.purchase.request"),
    payload: z
      .object({
        requestId: z.string().uuid(),
        campaignId: z.string().uuid(),
        merchantActorId: foundryIdentifier,
        buyer: z
          .object({
            userId: z.string().uuid(),
            displayName: z.string().trim().min(1).max(100),
            actorId: foundryIdentifier,
            actorName: z.string().trim().min(1).max(120),
          })
          .strict(),
        item: z
          .object({
            itemId: foundryIdentifier,
            name: z.string().trim().min(1).max(160),
            price: z.string().trim().min(1).max(64),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
        note: z.string().trim().max(500).nullable(),
        requestedAt: isoDate,
      })
      .strict(),
  })
  .strict();

/**
 * Troca o estoque sorteado no ator do Lojista. O módulo apaga só os itens que
 * ele mesmo criou em sorteios anteriores e preserva os colocados à mão.
 */
const MerchantStockReplaceCommandSchema = z
  .object({
    type: z.literal("merchant.stock.replace"),
    payload: z
      .object({
        drawId: z.string().uuid(),
        campaignId: z.string().uuid(),
        items: z.array(MerchantStockEntrySchema).min(1).max(100),
        requestedAt: isoDate,
      })
      .strict(),
  })
  .strict();

/**
 * Cria ou atualiza o ator de uma criatura da biblioteca. O módulo encontra o
 * ator pela marca `creatureId` e troca os itens; sem ator, cria um novo.
 */
const CreatureUpsertCommandSchema = z
  .object({
    type: z.literal("creature.upsert"),
    payload: z
      .object({
        creatureId: z.string().uuid(),
        campaignId: z.string().uuid(),
        version: z.number().int().positive(),
        creature: CreatureDraftSchema,
        requestedAt: isoDate,
      })
      .strict(),
  })
  .strict();

export const FoundryCommandInputSchema = z.discriminatedUnion("type", [
  ActorSyncCommandSchema,
  ChatMessageCommandSchema,
  MerchantPurchaseRequestCommandSchema,
  MerchantStockReplaceCommandSchema,
  CreatureUpsertCommandSchema,
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
    registeredAt: isoDate,
  })
  .strict();

export const FoundryWorldListResponseSchema = z
  .object({ data: z.array(FoundryWorldStatusSchema) })
  .strict();

export const FoundryPortalPairingViewSchema = z
  .object({
    pairing: FoundryPairingPreviewSchema,
    eligibleCampaigns: z.array(CampaignSchema),
  })
  .strict();

export type FoundryWorldIdentity = z.infer<typeof FoundryWorldIdentitySchema>;
export type FoundryPairingCreateRequest = z.infer<
  typeof FoundryPairingCreateRequestSchema
>;
export type FoundryPairingCreateResponse = z.infer<
  typeof FoundryPairingCreateResponseSchema
>;
export type FoundryPairingPollResponse = z.infer<
  typeof FoundryPairingPollResponseSchema
>;
export type FoundryPairingPreview = z.infer<typeof FoundryPairingPreviewSchema>;
export type FoundryPairingApprovalRequest = z.infer<
  typeof FoundryPairingApprovalRequestSchema
>;
export type FoundryPairingApprovalResponse = z.infer<
  typeof FoundryPairingApprovalResponseSchema
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
export type FoundryChatEntry = z.infer<typeof FoundryChatEntrySchema>;
export type FoundryChatBatchRequest = z.infer<
  typeof FoundryChatBatchRequestSchema
>;
export type FoundryChatBatchResponse = z.infer<
  typeof FoundryChatBatchResponseSchema
>;
export type FoundryCaptureSessionStartRequest = z.infer<
  typeof FoundryCaptureSessionStartRequestSchema
>;
export type FoundryCaptureSession = z.infer<
  typeof FoundryCaptureSessionSchema
>;
export type FoundryCaptureSessionListResponse = z.infer<
  typeof FoundryCaptureSessionListResponseSchema
>;
export type FoundryCaptureTranscript = z.infer<
  typeof FoundryCaptureTranscriptSchema
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
export type FoundryWorldListResponse = z.infer<
  typeof FoundryWorldListResponseSchema
>;
export type FoundryPortalPairingView = z.infer<
  typeof FoundryPortalPairingViewSchema
>;
