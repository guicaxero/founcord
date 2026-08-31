import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";

export const automationKinds = [
  "session_summary",
  "chronicle_draft",
  "record_extraction",
] as const;

export const automationJobStatuses = [
  "queued",
  "processing",
  "awaiting_review",
  "failed",
  "cancelled",
] as const;

export const automationSourceKinds = [
  "pasted_text",
  "discord_transcript",
  "foundry_chat",
] as const;

export const AutomationKindSchema = z.enum(automationKinds);
export const AutomationJobStatusSchema = z.enum(automationJobStatuses);
export const AutomationSourceKindSchema = z.enum(automationSourceKinds);

export const AutomationTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("post") }).strict(),
  z.object({ type: z.literal("session_summary"), sessionId: EntityIdSchema }).strict(),
]);

export const AutomationSourceSchema = z
  .object({
    kind: AutomationSourceKindSchema.default("pasted_text"),
    label: z.string().trim().min(3).max(120).optional(),
    content: z.string().trim().min(100).max(40_000),
  })
  .strict();

export const CreateAutomationJobSchema = z
  .object({
    campaignId: EntityIdSchema,
    kind: AutomationKindSchema,
    source: AutomationSourceSchema,
    suggestedTitle: z.string().trim().min(3).max(140).optional(),
    instructions: z.string().trim().min(3).max(2_000).optional(),
    target: AutomationTargetSchema.optional(),
  })
  .strict();

export const AutomationJobCreateRequestSchema = CreateAutomationJobSchema.extend({
  requestedByUserId: EntityIdSchema,
  requestedByName: z.string().trim().min(1).max(100),
  correlationId: EntityIdSchema,
}).strict();

export const AutomationJobSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    requestedByUserId: EntityIdSchema,
    requestedByName: z.string().min(1).max(100),
    kind: AutomationKindSchema,
    status: AutomationJobStatusSchema,
    sourceKind: AutomationSourceKindSchema,
    sourceLabel: z.string().nullable(),
    sourcePreview: z.string().max(240),
    suggestedTitle: z.string().nullable(),
    target: AutomationTargetSchema,
    postId: EntityIdSchema.nullable(),
    summaryId: EntityIdSchema.nullable(),
    attempts: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    model: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    startedAt: IsoDateTimeSchema.nullable(),
    completedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const AutomationQuotaSchema = z
  .object({
    day: z.string().date(),
    dailyJobLimit: z.number().int().positive(),
    usedToday: z.number().int().nonnegative(),
    remainingToday: z.number().int().nonnegative(),
  })
  .strict();

export const AutomationJobListResponseSchema = z
  .object({
    data: z.array(AutomationJobSchema),
    quota: AutomationQuotaSchema,
  })
  .strict();

export const AutomationJobCreateResponseSchema = z
  .object({
    job: AutomationJobSchema,
    duplicate: z.boolean(),
    quota: AutomationQuotaSchema,
  })
  .strict();

export const AutomationQueueMessageSchema = z
  .object({
    jobId: EntityIdSchema,
    correlationId: EntityIdSchema,
  })
  .strict();

export const AutomationGeneratedDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    body: z.string().trim().min(80).max(20_000),
  })
  .strict();

export const AutomationDraftCallbackSchema = AutomationGeneratedDraftSchema.extend({
  jobId: EntityIdSchema,
  campaignId: EntityIdSchema,
  requestedByUserId: EntityIdSchema,
  kind: AutomationKindSchema,
  model: z.string().min(1).max(160),
  target: AutomationTargetSchema,
}).strict();

export const AutomationDraftCallbackResponseSchema = z
  .object({
    postId: EntityIdSchema.nullable(),
    summaryId: EntityIdSchema.nullable(),
    status: z.literal("pending_review"),
    duplicate: z.boolean(),
  })
  .strict()
  .refine((value) => Boolean(value.postId) !== Boolean(value.summaryId), {
    message: "O resultado deve apontar para um post ou um resumo.",
  });

export const RetryAutomationJobSchema = z.object({}).strict();

export type AutomationKind = z.infer<typeof AutomationKindSchema>;
export type AutomationJobStatus = z.infer<typeof AutomationJobStatusSchema>;
export type AutomationSourceKind = z.infer<typeof AutomationSourceKindSchema>;
export type AutomationTarget = z.infer<typeof AutomationTargetSchema>;
export type CreateAutomationJobInput = z.infer<typeof CreateAutomationJobSchema>;
export type AutomationJobCreateRequest = z.infer<
  typeof AutomationJobCreateRequestSchema
>;
export type AutomationJob = z.infer<typeof AutomationJobSchema>;
export type AutomationQuota = z.infer<typeof AutomationQuotaSchema>;
export type AutomationJobListResponse = z.infer<
  typeof AutomationJobListResponseSchema
>;
export type AutomationJobCreateResponse = z.infer<
  typeof AutomationJobCreateResponseSchema
>;
export type AutomationQueueMessage = z.infer<typeof AutomationQueueMessageSchema>;
export type AutomationGeneratedDraft = z.infer<
  typeof AutomationGeneratedDraftSchema
>;
export type AutomationDraftCallback = z.infer<typeof AutomationDraftCallbackSchema>;
export type AutomationDraftCallbackResponse = z.infer<
  typeof AutomationDraftCallbackResponseSchema
>;
