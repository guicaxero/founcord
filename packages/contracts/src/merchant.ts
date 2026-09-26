import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema, foundryImageSchema } from "./common";

const foundryIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

/** Soma máxima das miniaturas de um catálogo, em caracteres de base64. */
export const MAX_CATALOG_IMAGE_CHARS = 1_000_000;

/** Ícone do item: HTTPS ou miniatura de 64 px gerada pelo módulo. */
const itemImage = foundryImageSchema(16_000);

/** Disponibilidade do sistema (`system.availability`: C, U, R, E). */
export const MerchantItemAvailabilitySchema = z.enum(["common", "uncommon", "rare", "exotic"]);

/** Tipo de consumível do sistema (`system.consumabletype`: D, F, I, P, V, T). */
export const MerchantConsumableTypeSchema = z.enum([
  "drink",
  "food",
  "incantation",
  "potion",
  "poison",
  "trinket",
]);

/** Nomes do livro em português, os mesmos da tradução do sistema no Foundry. */
export const MERCHANT_AVAILABILITY_LABELS = {
  common: "Comum",
  uncommon: "Incomum",
  rare: "Raro",
  exotic: "Exótico",
} as const satisfies Record<z.infer<typeof MerchantItemAvailabilitySchema>, string>;

export const MERCHANT_CONSUMABLE_LABELS = {
  drink: "Bebida",
  food: "Comida",
  incantation: "Encanto",
  potion: "Poção",
  poison: "Veneno",
  trinket: "Bugiganga",
} as const satisfies Record<z.infer<typeof MerchantConsumableTypeSchema>, string>;

const shortStat = z.string().trim().min(1).max(40).nullable().default(null);

const itemRequirement = z
  .object({
    attribute: z.enum(["strength", "agility", "intellect", "will", "perception"]),
    minimum: z.number().int().min(0).max(99),
  })
  .strict()
  .nullable()
  .default(null);

export const MerchantWeaponDetailsSchema = z
  .object({
    damage: shortStat,
    hands: z.enum(["one", "two", "off"]).nullable().default(null),
    requirement: itemRequirement,
  })
  .strict();

export const MerchantArmorDetailsSchema = z
  .object({
    defense: shortStat,
    agility: shortStat,
    fixed: shortStat,
    shield: z.boolean().default(false),
    requirement: itemRequirement,
  })
  .strict();

export const MerchantItemProjectionSchema = z
  .object({
    itemId: foundryIdentifier,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(4_000).nullable(),
    category: z.string().trim().min(1).max(80).nullable(),
    imageUrl: itemImage.nullable(),
    price: z.string().trim().min(1).max(64).nullable(),
    quantity: z.number().int().nonnegative().max(1_000_000).nullable(),
    // Campos a partir do módulo 0.7.0; catálogos antigos continuam válidos.
    availability: MerchantItemAvailabilitySchema.nullable().default(null),
    consumableType: MerchantConsumableTypeSchema.nullable().default(null),
    properties: z.string().trim().min(1).max(500).nullable().default(null),
    weapon: MerchantWeaponDetailsSchema.nullable().default(null),
    armor: MerchantArmorDetailsSchema.nullable().default(null),
    sourceUpdatedAt: IsoDateTimeSchema,
  })
  .strict();

export const FoundryMerchantCatalogProjectionSchema = z
  .object({
    merchantActorId: foundryIdentifier,
    merchantName: z.string().trim().min(1).max(160),
    sourceUpdatedAt: IsoDateTimeSchema,
    items: z
      .array(MerchantItemProjectionSchema)
      .max(500)
      // O catálogo inteiro vira uma linha do D1 (máximo de 2 MB); as miniaturas
      // somadas ficam bem abaixo disso.
      .refine(
        (items) => items.reduce((total, item) => total + (item.imageUrl?.length ?? 0), 0) <= MAX_CATALOG_IMAGE_CHARS,
        { message: "As miniaturas do catálogo excedem o limite total." },
      ),
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

export type MerchantItemAvailability = z.infer<typeof MerchantItemAvailabilitySchema>;
export type MerchantConsumableType = z.infer<typeof MerchantConsumableTypeSchema>;
export type MerchantWeaponDetails = z.infer<typeof MerchantWeaponDetailsSchema>;
export type MerchantArmorDetails = z.infer<typeof MerchantArmorDetailsSchema>;
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
