import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";

export const sessionSummaryStatuses = [
  "draft",
  "pending_review",
  "published",
  "archived",
] as const;

export const SessionSummaryStatusSchema = z.enum(sessionSummaryStatuses);
export const SessionSummarySourceSchema = z.enum(["manual", "automation"]);

export const SessionSummarySchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    sessionId: EntityIdSchema.nullable(),
    sessionTitle: z.string().trim().min(3).max(140).nullable(),
    mission: z
      .object({ id: EntityIdSchema, title: z.string().trim().min(1).max(100) })
      .strict()
      .nullable(),
    authorUserId: EntityIdSchema,
    authorName: z.string().trim().min(1).max(100),
    title: z.string().trim().min(3).max(140),
    body: z.string().trim().min(1).max(20_000),
    status: SessionSummaryStatusSchema,
    source: SessionSummarySourceSchema,
    reviewedBy: EntityIdSchema.nullable(),
    publishedAt: IsoDateTimeSchema.nullable(),
    version: z.number().int().positive(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const SessionSummaryListResponseSchema = z
  .object({ data: z.array(SessionSummarySchema) })
  .strict();

export const CreateSessionSummarySchema = z
  .object({
    campaignId: EntityIdSchema,
    sessionId: EntityIdSchema.nullable().default(null),
    title: z.string().trim().min(3).max(140),
    body: z.string().trim().min(1).max(20_000),
    status: SessionSummaryStatusSchema.default("draft"),
  })
  .strict();

export const UpdateSessionSummarySchema = z
  .object({
    title: z.string().trim().min(3).max(140).optional(),
    body: z.string().trim().min(1).max(20_000).optional(),
    status: SessionSummaryStatusSchema.optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Informe ao menos uma alteração.",
  });

export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type SessionSummaryListResponse = z.infer<typeof SessionSummaryListResponseSchema>;
export type CreateSessionSummaryInput = z.infer<typeof CreateSessionSummarySchema>;
export type UpdateSessionSummaryInput = z.infer<typeof UpdateSessionSummarySchema>;
export type SessionSummaryStatus = z.infer<typeof SessionSummaryStatusSchema>;
