import { z } from "zod";
import { AutomationJobCreateResponseSchema, AutomationKindSchema } from "./automations";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";

export const campaignSessionStatuses = [
  "prepared",
  "starting",
  "active",
  "ended",
  "cancelled",
  "capture_failed",
] as const;

export const CampaignSessionStatusSchema = z.enum(campaignSessionStatuses);

export const CampaignSessionCaptureStatusSchema = z.enum([
  "not_configured",
  "starting",
  "waiting",
  "capturing",
  "ended",
  "cancelled",
  "interrupted",
  "failed",
]);

const nullableEntityId = EntityIdSchema.nullable().default(null);
const nullableShortText = z.string().trim().min(1).max(200).nullable().default(null);

export const CreateCampaignSessionSchema = z
  .object({
    campaignId: EntityIdSchema,
    title: z.string().trim().min(3).max(140),
    missionId: nullableEntityId,
    worldId: nullableEntityId,
    discordReference: nullableShortText,
    notes: z.string().trim().max(20_000).default(""),
    startNow: z.boolean().default(true),
  })
  .strict();

export const UpdateCampaignSessionSchema = z
  .object({
    title: z.string().trim().min(3).max(140).optional(),
    missionId: EntityIdSchema.nullable().optional(),
    discordReference: z.string().trim().min(1).max(200).nullable().optional(),
    notes: z.string().trim().max(20_000).optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Informe ao menos uma alteração.",
  });

export const GenerateCampaignSessionDraftSchema = z
  .object({
    kind: AutomationKindSchema,
    suggestedTitle: z.string().trim().min(3).max(140).optional(),
    instructions: z.string().trim().min(3).max(2_000).optional(),
  })
  .strict();

export const CampaignSessionVersionSchema = z
  .object({ version: z.number().int().positive() })
  .strict();

export const CampaignSessionSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    title: z.string().trim().min(3).max(140),
    status: CampaignSessionStatusSchema,
    mission: z
      .object({ id: EntityIdSchema, title: z.string().trim().min(1).max(100) })
      .strict()
      .nullable(),
    master: z
      .object({ id: EntityIdSchema, name: z.string().trim().min(1).max(100) })
      .strict(),
    foundry: z
      .object({
        worldId: EntityIdSchema,
        worldTitle: z.string().trim().min(1).max(120),
        worldStatus: z.enum(["online", "offline", "revoked"]),
        captureStatus: CampaignSessionCaptureStatusSchema,
        messageCount: z.number().int().nonnegative(),
        lastMessageAt: IsoDateTimeSchema.nullable(),
        transcriptTruncated: z.boolean(),
        errorMessage: z.string().max(1_000).nullable(),
      })
      .strict()
      .nullable(),
    discordReference: z.string().trim().min(1).max(200).nullable(),
    discordImported: z.literal(false),
    notes: z.string().max(20_000),
    automationJobId: EntityIdSchema.nullable(),
    postId: EntityIdSchema.nullable(),
    summaryId: EntityIdSchema.nullable(),
    startedAt: IsoDateTimeSchema.nullable(),
    endedAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const CampaignSessionListResponseSchema = z
  .object({ data: z.array(CampaignSessionSchema) })
  .strict();

export const CampaignSessionOptionsSchema = z
  .object({
    missions: z.array(
      z
        .object({ id: EntityIdSchema, title: z.string().trim().min(1).max(100) })
        .strict(),
    ),
    worlds: z.array(
      z
        .object({
          worldId: EntityIdSchema,
          worldTitle: z.string().trim().min(1).max(120),
          status: z.enum(["online", "offline", "revoked"]),
        })
        .strict(),
    ),
    foundryAvailable: z.boolean(),
  })
  .strict();

export const CampaignSessionGenerationResponseSchema = z
  .object({
    session: CampaignSessionSchema,
    automation: AutomationJobCreateResponseSchema,
  })
  .strict();

export type CampaignSessionStatus = z.infer<typeof CampaignSessionStatusSchema>;
export type CampaignSessionCaptureStatus = z.infer<
  typeof CampaignSessionCaptureStatusSchema
>;
export type CreateCampaignSessionInput = z.infer<
  typeof CreateCampaignSessionSchema
>;
export type UpdateCampaignSessionInput = z.infer<
  typeof UpdateCampaignSessionSchema
>;
export type GenerateCampaignSessionDraftInput = z.infer<
  typeof GenerateCampaignSessionDraftSchema
>;
export type CampaignSession = z.infer<typeof CampaignSessionSchema>;
export type CampaignSessionListResponse = z.infer<
  typeof CampaignSessionListResponseSchema
>;
export type CampaignSessionOptions = z.infer<
  typeof CampaignSessionOptionsSchema
>;
export type CampaignSessionGenerationResponse = z.infer<
  typeof CampaignSessionGenerationResponseSchema
>;
