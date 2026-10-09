import { z } from "zod";

export const missionStatuses = [
  "draft",
  "pending_review",
  "approved",
  "published",
  "archived",
  "rejected",
] as const;

export const MissionStatusSchema = z.enum(missionStatuses);

export const MissionRiskSchema = z.enum([
  "unknown",
  "moderate",
  "dangerous",
  "deadly",
]);

export const MissionSignupStatusSchema = z.enum([
  "confirmed",
  "waitlisted",
  "withdrawn",
]);

export const MissionSummarySchema = z
  .object({
    id: z.string().uuid(),
    campaignId: z.string().uuid(),
    authorUserId: z.string().uuid(),
    authorName: z.string().min(1),
    title: z.string().trim().min(3).max(100),
    summary: z.string().trim().min(1).max(1_200),
    region: z.string().trim().min(1).max(80),
    status: MissionStatusSchema,
    risk: MissionRiskSchema,
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
    partySize: z.number().int().min(1).max(12),
    signupCount: z.number().int().nonnegative(),
    waitlistCount: z.number().int().nonnegative(),
    currentUserSignup: MissionSignupStatusSchema.nullable(),
    /** Capa da missão (`/media/<id>`), duração estimada e tópico no Discord. */
    coverMediaId: z.string().uuid().nullable().default(null),
    estimatedDuration: z.string().max(60).nullable().default(null),
    discordThreadId: z.string().nullable().default(null),
    version: z.number().int().positive(),
  })
  .strict();

export const MissionListResponseSchema = z
  .object({
    data: z.array(MissionSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const CreateMissionSchema = z
  .object({
    campaignId: z.string().uuid(),
    title: z.string().trim().min(3).max(100),
    summary: z.string().trim().min(1).max(1_200),
    region: z.string().trim().min(1).max(80),
    risk: MissionRiskSchema.default("unknown"),
    scheduledFor: z.string().datetime({ offset: true }).nullable().default(null),
    partySize: z.number().int().min(1).max(12).default(5),
    coverMediaId: z.string().uuid().nullable().default(null),
    estimatedDuration: z.string().trim().max(60).nullable().default(null),
  })
  .strict();

export const UpdateMissionSchema = z
  .object({
    title: z.string().trim().min(3).max(100).optional(),
    summary: z.string().trim().min(1).max(1_200).optional(),
    region: z.string().trim().min(1).max(80).optional(),
    risk: MissionRiskSchema.optional(),
    scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
    partySize: z.number().int().min(1).max(12).optional(),
    coverMediaId: z.string().uuid().nullable().optional(),
    estimatedDuration: z.string().trim().max(60).nullable().optional(),
    status: MissionStatusSchema.optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Informe ao menos uma alteração.",
  });

export const MissionSignupSchema = z
  .object({
    missionId: z.string().uuid(),
    userId: z.string().uuid(),
    displayName: z.string().min(1),
    status: MissionSignupStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const MissionSignupListResponseSchema = z
  .object({ data: z.array(MissionSignupSchema) })
  .strict();

export type MissionStatus = z.infer<typeof MissionStatusSchema>;
export type MissionRisk = z.infer<typeof MissionRiskSchema>;
export type MissionSummary = z.infer<typeof MissionSummarySchema>;
export type MissionListResponse = z.infer<typeof MissionListResponseSchema>;
export type CreateMissionInput = z.infer<typeof CreateMissionSchema>;
export type UpdateMissionInput = z.infer<typeof UpdateMissionSchema>;
export type MissionSignup = z.infer<typeof MissionSignupSchema>;
