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
