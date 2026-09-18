import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";

const foundryIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

const publicImageUrl = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => new URL(value).protocol === "https:", {
    message: "A imagem pública deve usar HTTPS.",
  });

export const MerchantItemProjectionSchema = z
  .object({
    itemId: foundryIdentifier,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(4_000).nullable(),
    category: z.string().trim().min(1).max(80).nullable(),
    imageUrl: publicImageUrl.nullable(),
    price: z.string().trim().min(1).max(64).nullable(),
    quantity: z.number().int().nonnegative().max(1_000_000).nullable(),
    sourceUpdatedAt: IsoDateTimeSchema,
  })
  .strict();

export const FoundryMerchantCatalogProjectionSchema = z
  .object({
    merchantActorId: foundryIdentifier,
    merchantName: z.string().trim().min(1).max(160),
    sourceUpdatedAt: IsoDateTimeSchema,
    items: z.array(MerchantItemProjectionSchema).max(500),
  })
  .strict();

export const FoundryMerchantSyncRequestSchema = z
  .object({
    syncId: z.string().uuid(),
    capturedAt: IsoDateTimeSchema,
    catalog: FoundryMerchantCatalogProjectionSchema,
  })
  .strict();

export const FoundryMerchantSyncResponseSchema = z
  .object({
    syncId: z.string().uuid(),
    accepted: z.number().int().nonnegative(),
    duplicate: z.boolean(),
    stale: z.boolean(),
  })
  .strict();

export const MerchantConnectionSchema = z
  .object({
    status: z.enum(["online", "offline", "not_connected"]),
    lastSeenAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const MerchantCatalogViewSchema = z
  .object({
    merchantName: z.string().trim().min(1).max(160),
    syncedAt: IsoDateTimeSchema,
    freshness: z.enum(["fresh", "stale", "offline"]),
    items: z.array(MerchantItemProjectionSchema).max(500),
  })
  .strict();

export const MerchantCatalogResponseSchema = z
  .object({
    campaignId: EntityIdSchema,
    connection: MerchantConnectionSchema,
    catalog: MerchantCatalogViewSchema.nullable(),
  })
  .strict();

export const MerchantPurchaseStatuses = [
  "pending_delivery",
  "awaiting_master",
  "delivery_failed",
  "fulfilled",
  "rejected",
  "cancelled",
] as const;

export const MerchantPurchaseStatusSchema = z.enum(MerchantPurchaseStatuses);

export const MerchantPurchaseRequestInputSchema = z
  .object({
    requestId: EntityIdSchema,
    itemId: foundryIdentifier,
    quantity: z.number().int().min(1).max(99),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

export const MerchantPurchaseRequestSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    requester: z
      .object({
        userId: EntityIdSchema,
        displayName: z.string().trim().min(1).max(100),
      })
      .strict(),
    character: z
      .object({
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
    status: MerchantPurchaseStatusSchema,
    deliveryError: z.string().trim().max(1_000).nullable(),
    resolutionNote: z.string().trim().max(500).nullable(),
    resolvedByName: z.string().trim().min(1).max(100).nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    resolvedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const MerchantPurchaseListResponseSchema = z
  .object({ data: z.array(MerchantPurchaseRequestSchema) })
  .strict();

export const MerchantPurchaseDecisionInputSchema = z
  .object({
    action: z.enum(["fulfill", "reject", "cancel"]),
    resolutionNote: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

export const MerchantPurchaseDeliveryCallbackSchema = z
  .object({
    requestId: EntityIdSchema,
    commandId: EntityIdSchema,
    outcome: z.enum(["succeeded", "failed"]),
    error: z.string().trim().max(1_000).nullable().default(null),
    deliveredAt: IsoDateTimeSchema,
  })
  .strict();

export const FoundryMerchantPurchaseContextSchema = z
  .object({
    campaignId: EntityIdSchema,
    worldId: EntityIdSchema,
    connection: MerchantConnectionSchema,
    catalog: z
      .object({
        merchantActorId: foundryIdentifier,
        merchantName: z.string().trim().min(1).max(160),
        syncId: z.string().uuid(),
        syncedAt: IsoDateTimeSchema,
        items: z.array(MerchantItemProjectionSchema).max(500),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type MerchantItemProjection = z.infer<
  typeof MerchantItemProjectionSchema
>;
export type FoundryMerchantCatalogProjection = z.infer<
  typeof FoundryMerchantCatalogProjectionSchema
>;
export type FoundryMerchantSyncRequest = z.infer<
  typeof FoundryMerchantSyncRequestSchema
>;
export type FoundryMerchantSyncResponse = z.infer<
  typeof FoundryMerchantSyncResponseSchema
>;
export type MerchantCatalogView = z.infer<typeof MerchantCatalogViewSchema>;
export type MerchantCatalogResponse = z.infer<
  typeof MerchantCatalogResponseSchema
>;
export type MerchantPurchaseStatus = z.infer<typeof MerchantPurchaseStatusSchema>;
export type MerchantPurchaseRequestInput = z.infer<
  typeof MerchantPurchaseRequestInputSchema
>;
export type MerchantPurchaseRequest = z.infer<
  typeof MerchantPurchaseRequestSchema
>;
export type MerchantPurchaseListResponse = z.infer<
  typeof MerchantPurchaseListResponseSchema
>;
export type MerchantPurchaseDecisionInput = z.infer<
  typeof MerchantPurchaseDecisionInputSchema
>;
export type MerchantPurchaseDeliveryCallback = z.infer<
  typeof MerchantPurchaseDeliveryCallbackSchema
>;
export type FoundryMerchantPurchaseContext = z.infer<
  typeof FoundryMerchantPurchaseContextSchema
>;
