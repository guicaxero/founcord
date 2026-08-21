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

export const MissionSummarySchema = z
  .object({
    id: z.string().uuid(),
    campaignId: z.string().uuid(),
    title: z.string().trim().min(3).max(100),
    summary: z.string().trim().min(1).max(1_200),
    region: z.string().trim().min(1).max(80),
    status: MissionStatusSchema,
    risk: MissionRiskSchema,
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
    partySize: z.number().int().min(1).max(12),
    signupCount: z.number().int().nonnegative(),
  })
  .strict();

export const MissionListResponseSchema = z
  .object({
    data: z.array(MissionSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export type MissionStatus = z.infer<typeof MissionStatusSchema>;
export type MissionRisk = z.infer<typeof MissionRiskSchema>;
export type MissionSummary = z.infer<typeof MissionSummarySchema>;
export type MissionListResponse = z.infer<typeof MissionListResponseSchema>;
