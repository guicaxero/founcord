import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";

export const AuditEntrySchema = z
  .object({
    id: EntityIdSchema,
    actorUserId: EntityIdSchema.nullable(),
    actorName: z.string().nullable(),
    campaignId: EntityIdSchema.nullable(),
    action: z.string().min(1).max(100),
    entityType: z.string().min(1).max(60),
    entityId: z.string().min(1).max(100),
    correlationId: EntityIdSchema,
    details: z.record(z.string(), z.unknown()),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const AuditListResponseSchema = z
  .object({ data: z.array(AuditEntrySchema) })
  .strict();

export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;
