import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";
import { MissionOutcomeSchema } from "./missions";

/**
 * Importação de crônicas que já estão nos fóruns do Discord. O Worker do
 * Discord lê os fóruns e a mensagem inicial de cada tópico; o portal copia as
 * imagens para o próprio armazenamento e cria a crônica.
 */
const snowflake = z.string().regex(/^\d{5,25}$/u);

export const DiscordForumSchema = z.object({ id: snowflake, name: z.string().max(100) }).strict();
export const DiscordForumListResponseSchema = z.object({ data: z.array(DiscordForumSchema) }).strict();

export const DiscordForumThreadSchema = z
  .object({
    threadId: snowflake,
    name: z.string().max(200),
    createdAt: IsoDateTimeSchema,
    archived: z.boolean(),
  })
  .strict();
export const DiscordForumThreadListResponseSchema = z
  .object({ data: z.array(DiscordForumThreadSchema) })
  .strict();

export const DiscordAttachmentSchema = z
  .object({
    url: z.string().url().startsWith("https://"),
    filename: z.string().max(260),
    contentType: z.string().max(100).nullable(),
    size: z.number().int().nonnegative(),
  })
  .strict();

/** Mensagem inicial do tópico, com menções e emojis já em texto simples. */
export const DiscordStarterMessageSchema = z
  .object({
    threadId: snowflake,
    forumChannelId: snowflake,
    title: z.string().max(200),
    authorName: z.string().max(100),
    content: z.string().max(10_000),
    createdAt: IsoDateTimeSchema,
    attachments: z.array(DiscordAttachmentSchema).max(10),
  })
  .strict();

/** Tópico do fórum como o portal mostra na importação. */
export const DiscordImportThreadSchema = DiscordForumThreadSchema.extend({
  /** Crônica do portal que já veio deste tópico, se houver. */
  importedPostId: EntityIdSchema.nullable(),
  /** Missão do portal ligada a este tópico (importada ou publicada pelo portal). */
  importedMissionId: EntityIdSchema.nullable().default(null),
}).strict();
export const DiscordImportThreadListResponseSchema = z
  .object({ data: z.array(DiscordImportThreadSchema) })
  .strict();

export const DiscordImportInputSchema = z
  .object({
    forumChannelId: snowflake,
    threadIds: z
      .array(snowflake)
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Cada tópico só pode aparecer uma vez." }),
    /** Publica já, com a data original do Discord; senão, entra como rascunho. */
    publish: z.boolean().default(false),
  })
  .strict();

export const DiscordImportResultSchema = z
  .object({
    imported: z.array(
      z.object({ threadId: snowflake, postId: EntityIdSchema, title: z.string(), images: z.number().int() }).strict(),
    ),
    skipped: z.array(z.object({ threadId: snowflake, reason: z.string().max(300) }).strict()),
  })
  .strict();

/**
 * Importação de registros de missão: cada tópico vira uma missão publicada
 * direto no registro, com a situação escolhida pelo mestre.
 */
export const MissionDiscordImportInputSchema = z
  .object({
    forumChannelId: snowflake,
    items: z
      .array(z.object({ threadId: snowflake, outcome: MissionOutcomeSchema }).strict())
      .min(1)
      .max(20)
      .refine((items) => new Set(items.map((item) => item.threadId)).size === items.length, {
        message: "Cada tópico só pode aparecer uma vez.",
      }),
  })
  .strict();

export const MissionDiscordImportResultSchema = z
  .object({
    imported: z.array(
      z
        .object({
          threadId: snowflake,
          missionId: EntityIdSchema,
          title: z.string(),
          number: z.number().int().nullable(),
          images: z.number().int(),
        })
        .strict(),
    ),
    skipped: z.array(z.object({ threadId: snowflake, reason: z.string().max(300) }).strict()),
    /** Avisos sobre missões que entraram, como número repetido. */
    notes: z.array(z.object({ threadId: snowflake, note: z.string().max(300) }).strict()).default([]),
  })
  .strict();

/**
 * "Missão Nº 002 - Ecos na Floresta" → número 2 e nome "Ecos na Floresta".
 * Títulos sem número ficam inteiros.
 */
export function parseMissionThreadTitle(title: string): { number: number | null; title: string } {
  const match = /^\s*miss[aã]o\s*n?\s*[º°o.]*\s*(\d{1,4})\s*[-–—:|]*\s*(.*)$/iu.exec(title);
  if (!match) return { number: null, title: title.trim() };
  const number = Number(match[1]);
  const rest = (match[2] ?? "").trim();
  return { number: number >= 1 ? number : null, title: rest || title.trim() };
}

/** Região do chamado, pela linha "Local: …" do texto do Discord. */
export function missionRegionFrom(content: string): string | null {
  const match = /^\s*(?:\*\*)?local(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/imu.exec(content);
  const region = match?.[1]?.replace(/\*\*/gu, "").trim();
  return region ? region.slice(0, 80) : null;
}

/** Data de criação embutida no id do Discord (snowflake). */
export function snowflakeDate(id: string): string {
  const discordEpoch = 1_420_070_400_000n;
  return new Date(Number((BigInt(id) >> 22n) + discordEpoch)).toISOString();
}

type Mention = Readonly<{ id: string; name: string }>;

/**
 * Troca o que só faz sentido dentro do Discord por texto: menções de pessoas
 * pelo nome, de cargos e canais por um texto genérico, emojis do servidor pelo
 * nome e marcas de tempo por data.
 */
export function discordContentToText(content: string, mentions: readonly Mention[]): string {
  const names = new Map(mentions.map((mention) => [mention.id, mention.name]));
  return content
    .replace(/<@!?(\d+)>/gu, (_match, id: string) => `@${names.get(id) ?? "alguém"}`)
    .replace(/<@&\d+>/gu, "@cargo")
    .replace(/<#\d+>/gu, "#canal")
    .replace(/<a?:(\w+):\d+>/gu, ":$1:")
    .replace(/<t:(\d+)(?::[tTdDfFR])?>/gu, (_match, seconds: string) =>
      new Date(Number(seconds) * 1_000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    );
}

export type DiscordForum = z.infer<typeof DiscordForumSchema>;
export type DiscordForumThread = z.infer<typeof DiscordForumThreadSchema>;
export type DiscordStarterMessage = z.infer<typeof DiscordStarterMessageSchema>;
export type DiscordImportThread = z.infer<typeof DiscordImportThreadSchema>;
export type DiscordImportInput = z.infer<typeof DiscordImportInputSchema>;
export type DiscordImportResult = z.infer<typeof DiscordImportResultSchema>;
export type DiscordForumListResponse = z.infer<typeof DiscordForumListResponseSchema>;
export type DiscordImportThreadListResponse = z.infer<typeof DiscordImportThreadListResponseSchema>;
export type MissionDiscordImportInput = z.infer<typeof MissionDiscordImportInputSchema>;
export type MissionDiscordImportResult = z.infer<typeof MissionDiscordImportResultSchema>;
