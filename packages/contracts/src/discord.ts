import { z } from "zod";
import { EntityIdSchema } from "./common";
import { PostSchema } from "./posts";

export const DiscordSnowflakeSchema = z.string().regex(/^\d{6,32}$/);

const DiscordUserSchema = z
  .object({
    id: DiscordSnowflakeSchema,
    username: z.string().min(1),
    global_name: z.string().nullable().optional(),
  })
  .passthrough();

const DiscordComponentSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.number().int(),
      custom_id: z.string().optional(),
      value: z.string().optional(),
      components: z.array(DiscordComponentSchema).optional(),
    })
    .passthrough(),
);

const DiscordCommandOptionSchema = z
  .object({
    name: z.string().min(1),
    type: z.number().int(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    focused: z.boolean().optional(),
  })
  .passthrough();

const DiscordResolvedChannelSchema = z
  .object({
    id: DiscordSnowflakeSchema,
    type: z.number().int(),
    name: z.string().optional(),
  })
  .passthrough();

export const DiscordInteractionSchema = z
  .object({
    id: DiscordSnowflakeSchema,
    application_id: DiscordSnowflakeSchema,
    type: z.number().int(),
    token: z.string().min(1),
    guild_id: DiscordSnowflakeSchema.optional(),
    channel_id: DiscordSnowflakeSchema.optional(),
    member: z
      .object({ user: DiscordUserSchema })
      .passthrough()
      .optional(),
    user: DiscordUserSchema.optional(),
    data: z
      .object({
        name: z.string().optional(),
        custom_id: z.string().optional(),
        components: z.array(DiscordComponentSchema).optional(),
        options: z.array(DiscordCommandOptionSchema).optional(),
        resolved: z
          .object({
            channels: z.record(DiscordSnowflakeSchema, DiscordResolvedChannelSchema).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const CreateDiscordPostDraftSchema = z
  .object({
    campaignId: EntityIdSchema,
    interactionId: DiscordSnowflakeSchema,
    discordUserId: DiscordSnowflakeSchema,
    guildId: DiscordSnowflakeSchema.nullable(),
    channelId: DiscordSnowflakeSchema.nullable(),
    forumChannelId: DiscordSnowflakeSchema,
    forumTagId: DiscordSnowflakeSchema.nullable().default(null),
    personaName: z.string().trim().min(1).max(80).nullable(),
    title: z.string().trim().min(3).max(100),
    body: z.string().trim().min(1).max(1_700),
  })
  .strict();

export const DiscordPostDraftResponseSchema = z
  .object({ post: PostSchema })
  .strict();

export const DiscordPostPublicationSchema = z
  .object({
    type: z.literal("discord.post.publish"),
    version: z.literal(1),
    postId: EntityIdSchema,
    campaignId: EntityIdSchema,
    correlationId: z.string().uuid(),
  })
  .strict();

export type DiscordInteraction = z.infer<typeof DiscordInteractionSchema>;
export type CreateDiscordPostDraftInput = z.infer<
  typeof CreateDiscordPostDraftSchema
>;
export type DiscordPostDraftResponse = z.infer<
  typeof DiscordPostDraftResponseSchema
>;
export type DiscordPostPublication = z.infer<
  typeof DiscordPostPublicationSchema
>;
