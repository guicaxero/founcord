import { z } from "zod";
import { EntityIdSchema } from "./common";
import { DiscordSnowflakeSchema } from "./discord";

/**
 * Registro do Corvo: o tópico de cada Corvo no fórum do Discord, onde o bot
 * publica as atividades da Sede e os resultados.
 */

export const CharacterRegistroInputSchema = z
  .object({
    /** Link do tópico (copiado do Discord) ou o ID; `null` remove. */
    thread: z.string().trim().min(1).max(300).nullable(),
  })
  .strict();

export const RegistroThreadSchema = z
  .object({
    id: DiscordSnowflakeSchema,
    guildId: DiscordSnowflakeSchema,
    name: z.string().max(200),
    archived: z.boolean(),
  })
  .strict();

export const RegistroThreadListResponseSchema = z.object({ data: z.array(RegistroThreadSchema) }).strict();

/** Mensagem para o tópico do Corvo, enviada pela fila de publicações do Discord. */
export const DiscordRegistroMessageSchema = z
  .object({
    type: z.literal("discord.registro.message"),
    version: z.literal(1),
    campaignId: EntityIdSchema,
    threadId: DiscordSnowflakeSchema,
    content: z.string().min(1).max(2_000),
    correlationId: z.string().uuid(),
    reference: z
      .object({
        kind: z.literal("sede_declaration"),
        id: EntityIdSchema,
        event: z.enum(["declared", "resolved", "cancelled"]),
      })
      .strict(),
  })
  .strict();

/**
 * Lê o tópico a partir de um link do Discord (`/channels/<servidor>/<tópico>`,
 * com ou sem o ID de uma mensagem no fim) ou de um ID solto.
 */
export function parseDiscordThreadReference(
  value: string,
): Readonly<{ threadId: string; guildId: string | null }> | null {
  const trimmed = value.trim();
  if (/^\d{6,32}$/u.test(trimmed)) return { threadId: trimmed, guildId: null };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/u.test(url.hostname)) return null;
  const [channels, guildId, threadId] = url.pathname.split("/").filter(Boolean);
  if (channels !== "channels" || !guildId || !threadId) return null;
  if (!/^\d{6,32}$/u.test(guildId) || !/^\d{6,32}$/u.test(threadId)) return null;
  return { threadId, guildId };
}

/** Link do tópico para abrir no Discord. */
export function discordThreadUrl(guildId: string, threadId: string): string {
  return `https://discord.com/channels/${guildId}/${threadId}`;
}

export type CharacterRegistroInput = z.infer<typeof CharacterRegistroInputSchema>;
export type RegistroThread = z.infer<typeof RegistroThreadSchema>;
export type RegistroThreadListResponse = z.infer<typeof RegistroThreadListResponseSchema>;
export type DiscordRegistroMessage = z.infer<typeof DiscordRegistroMessageSchema>;
