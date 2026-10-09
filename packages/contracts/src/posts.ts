import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";
import { GalleryMediaIdsSchema } from "./media";

export const postStatuses = [
  "draft",
  "pending_review",
  "approved",
  "published",
  "archived",
  "rejected",
] as const;

export const PostStatusSchema = z.enum(postStatuses);
export const PostSourceSchema = z.enum([
  "manual",
  "discord",
  "foundry",
  "automation",
]);

export const PostSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    authorUserId: EntityIdSchema,
    authorName: z.string().min(1),
    title: z.string().trim().min(3).max(140),
    body: z.string().trim().min(1).max(20_000),
    status: PostStatusSchema,
    source: PostSourceSchema,
    reviewedBy: EntityIdSchema.nullable(),
    publishedAt: IsoDateTimeSchema.nullable(),
    /** Capa da crônica e imagens extras, em ordem (`/media/<id>`). */
    coverMediaId: EntityIdSchema.nullable().default(null),
    galleryMediaIds: GalleryMediaIdsSchema.default([]),
    /** Tópico do Discord de onde a crônica foi importada; o portal não a republica lá. */
    discordThreadId: z.string().nullable().default(null),
    version: z.number().int().positive(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const CreatePostSchema = z
  .object({
    campaignId: EntityIdSchema,
    title: z.string().trim().min(3).max(140),
    body: z.string().trim().min(1).max(20_000),
    source: PostSourceSchema.default("manual"),
    coverMediaId: EntityIdSchema.nullable().default(null),
    galleryMediaIds: GalleryMediaIdsSchema.default([]),
  })
  .strict();

export const UpdatePostSchema = z
  .object({
    title: z.string().trim().min(3).max(140).optional(),
    body: z.string().trim().min(1).max(20_000).optional(),
    coverMediaId: EntityIdSchema.nullable().optional(),
    galleryMediaIds: GalleryMediaIdsSchema.optional(),
    status: PostStatusSchema.optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Informe ao menos uma alteração.",
  });

export const PostListResponseSchema = z
  .object({ data: z.array(PostSchema) })
  .strict();

export type Post = z.infer<typeof PostSchema>;
export type PostListResponse = z.infer<typeof PostListResponseSchema>;
export type PostStatus = z.infer<typeof PostStatusSchema>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>;
