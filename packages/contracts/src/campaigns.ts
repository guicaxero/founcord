import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema, UserSchema } from "./common";

export const CampaignStatusSchema = z.enum(["draft", "active", "archived"]);

export const CampaignSchema = z
  .object({
    id: EntityIdSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().max(2_000),
    status: CampaignStatusSchema,
    isPublic: z.boolean(),
    version: z.number().int().positive(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const CreateCampaignSchema = CampaignSchema.pick({
  slug: true,
  name: true,
  description: true,
  isPublic: true,
}).extend({ status: CampaignStatusSchema.default("draft") });

export const UpdateCampaignSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    name: z.string().trim().min(3).max(100).optional(),
    description: z.string().trim().max(2_000).optional(),
    status: CampaignStatusSchema.optional(),
    isPublic: z.boolean().optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Informe ao menos uma alteração.",
  });

export const CampaignMemberStatusSchema = z.enum([
  "active",
  "suspended",
  "left",
]);

export const CampaignRoleSchema = z.enum([
  "campaign_manager",
  "gm",
  "editor",
  "moderator",
  "player",
  "automation",
]);

export const CampaignMemberSchema = z
  .object({
    campaignId: EntityIdSchema,
    user: UserSchema,
    status: CampaignMemberStatusSchema,
    roles: z.array(z.string()),
    joinedAt: IsoDateTimeSchema,
  })
  .strict();

export const UpdateCampaignMemberSchema = z
  .object({
    status: CampaignMemberStatusSchema.optional(),
    role: CampaignRoleSchema.optional(),
    removeRole: CampaignRoleSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined ||
      value.role !== undefined ||
      value.removeRole !== undefined,
    { message: "Informe status ou papel." },
  );

export const AddCampaignMemberSchema = z
  .object({
    discordUserId: z.string().min(1).max(32),
    role: CampaignRoleSchema.default("player"),
  })
  .strict();

export const CampaignListResponseSchema = z
  .object({ data: z.array(CampaignSchema) })
  .strict();

export const CampaignMemberListResponseSchema = z
  .object({ data: z.array(CampaignMemberSchema) })
  .strict();

export type Campaign = z.infer<typeof CampaignSchema>;
export type CampaignListResponse = z.infer<typeof CampaignListResponseSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type CampaignMember = z.infer<typeof CampaignMemberSchema>;
export type CampaignMemberListResponse = z.infer<
  typeof CampaignMemberListResponseSchema
>;
export type UpdateCampaignMemberInput = z.infer<
  typeof UpdateCampaignMemberSchema
>;
export type AddCampaignMemberInput = z.infer<typeof AddCampaignMemberSchema>;
