import { z } from "zod";

export const EntityIdSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const ApiErrorSchema = z
  .object({
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      correlationId: z.string().uuid(),
      fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    }),
  })
  .strict();

export const UserSchema = z
  .object({
    id: EntityIdSchema,
    discordUserId: z.string().min(1),
    displayName: z.string().min(1).max(100),
    avatarUrl: z.string().url().nullable(),
  })
  .strict();

export const CapabilitySchema = z
  .object({
    permission: z.string().min(1),
    scopeKind: z.enum(["global", "campaign"]),
    scopeId: z.string(),
  })
  .strict();

export const RoleNameSchema = z.enum([
  "owner",
  "administrator",
  "campaign_manager",
  "gm",
  "editor",
  "moderator",
  "player",
  "automation",
]);

export const RoleAssignmentViewSchema = z
  .object({
    roleName: RoleNameSchema,
    scopeKind: z.enum(["global", "campaign"]),
    scopeId: z.string(),
  })
  .strict();

export const CurrentUserResponseSchema = z
  .object({
    authenticated: z.boolean(),
    user: UserSchema.nullable(),
    capabilities: z.array(CapabilitySchema),
    assignments: z.array(RoleAssignmentViewSchema),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type User = z.infer<typeof UserSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type RoleAssignmentView = z.infer<typeof RoleAssignmentViewSchema>;
export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;
