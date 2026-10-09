import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";

/**
 * Imagens enviadas ao portal (capas de crônicas e missões, galerias). O
 * arquivo fica no Workers KV do portal e é servido em `/media/<id>`. O
 * navegador reduz a imagem antes do envio (até 1600 px, em WebP).
 */
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const MEDIA_CONTENT_TYPES = ["image/webp", "image/png", "image/jpeg", "image/gif"] as const;
/** Imagens extras de uma crônica, além da capa. */
export const MAX_GALLERY_IMAGES = 8;

export const MediaContentTypeSchema = z.enum(MEDIA_CONTENT_TYPES);

export const MediaAssetSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    url: z.string().startsWith("/media/"),
    contentType: MediaContentTypeSchema,
    bytes: z.number().int().positive().max(MEDIA_MAX_BYTES),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const GalleryMediaIdsSchema = z
  .array(EntityIdSchema)
  .max(MAX_GALLERY_IMAGES)
  .refine((ids) => new Set(ids).size === ids.length, { message: "Cada imagem só pode aparecer uma vez." });

/** Caminho público da imagem. */
export function mediaUrl(mediaId: string): string {
  return `/media/${mediaId}`;
}

/**
 * Tipo real da imagem pelos primeiros bytes, sem confiar no nome nem no
 * cabeçalho enviado; `null` quando não é um dos formatos aceitos.
 */
export function detectImageType(bytes: Uint8Array): MediaContentType | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export type MediaContentType = z.infer<typeof MediaContentTypeSchema>;
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
