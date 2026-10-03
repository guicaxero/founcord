import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema, foundryImageSchema } from "./common";
import { DemonLordCoinsSchema } from "./currency";

const FoundryReferenceSchema = z.string().min(1).max(128);

export const CharacterPathSummarySchema = z
  .object({
    novice: z.string().nullable(),
    expert: z.string().nullable(),
    master: z.string().nullable(),
    legendary: z.string().nullable(),
  })
  .strict();

export const CharacterStatisticsSummarySchema = z
  .object({
    healthMax: z.number().int().nonnegative(),
    damage: z.number().int().nonnegative(),
    healingRate: z.number().int().nonnegative(),
    insanity: z.number().int().nonnegative(),
    corruption: z.number().int().nonnegative(),
  })
  .strict();

export const CampaignCharacterProjectionSchema = z
  .object({
    worldId: FoundryReferenceSchema,
    actorId: FoundryReferenceSchema,
    name: z.string().trim().min(1).max(120),
    level: z.number().int().nonnegative(),
    ancestry: z.string().nullable(),
    paths: CharacterPathSummarySchema,
    statistics: CharacterStatisticsSummarySchema,
    /** Saldo registrado no Foundry; `null` até o módulo 0.6.0 sincronizá-lo. */
    wealth: DemonLordCoinsSchema.nullable(),
    /** Retrato e token do Foundry; `null` sem imagem ou antes do módulo 0.9.0. */
    portraitUrl: foundryImageSchema(60_000).nullable(),
    tokenUrl: foundryImageSchema(60_000).nullable(),
    sourceUpdatedAt: IsoDateTimeSchema,
    lastSyncedAt: IsoDateTimeSchema,
    active: z.boolean(),
  })
  .strict();

export const CampaignCharacterLinkSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    userId: EntityIdSchema,
    worldId: FoundryReferenceSchema,
    actorId: FoundryReferenceSchema,
    actorName: z.string().trim().min(1).max(120),
    /** Tópico do Corvo no Registro do Corvo (Discord), com o servidor para montar o link. */
    registro: z
      .object({ threadId: z.string().regex(/^\d{6,32}$/u), guildId: z.string().regex(/^\d{6,32}$/u).nullable() })
      .strict()
      .nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    character: CampaignCharacterProjectionSchema.nullable(),
  })
  .strict();

export const CampaignCharacterLinkInputSchema = z
  .object({
    worldId: FoundryReferenceSchema,
    actorId: FoundryReferenceSchema,
  })
  .strict();

export const CampaignCharacterLinkManagementResponseSchema = z
  .object({
    data: z.object({
      links: z.array(CampaignCharacterLinkSchema),
      candidates: z.array(CampaignCharacterProjectionSchema),
    }),
  })
  .strict();

export const PlayerCharacterEntrySchema = z
  .object({
    campaign: z
      .object({
        id: EntityIdSchema,
        name: z.string().trim().min(1).max(100),
      })
      .strict(),
    link: CampaignCharacterLinkSchema.nullable(),
  })
  .strict();

export const PlayerCharacterListResponseSchema = z
  .object({ data: z.array(PlayerCharacterEntrySchema) })
  .strict();

export type CampaignCharacterProjection = z.infer<
  typeof CampaignCharacterProjectionSchema
>;
export type CampaignCharacterLink = z.infer<typeof CampaignCharacterLinkSchema>;
export type CampaignCharacterLinkInput = z.infer<
  typeof CampaignCharacterLinkInputSchema
>;
export type CampaignCharacterLinkManagementResponse = z.infer<
  typeof CampaignCharacterLinkManagementResponseSchema
>;
export type PlayerCharacterEntry = z.infer<typeof PlayerCharacterEntrySchema>;
export type PlayerCharacterListResponse = z.infer<
  typeof PlayerCharacterListResponseSchema
>;
