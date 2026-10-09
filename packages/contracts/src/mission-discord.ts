import { z } from "zod";
import { MEDIA_CONTENT_TYPES, MEDIA_MAX_BYTES } from "./media";
import type { MissionSummary } from "./missions";

/**
 * Publicação de uma missão num fórum do Discord (registros-das-missões), com a
 * capa como anexo para aparecer na galeria do fórum e as tags escolhidas.
 */
const snowflake = z.string().regex(/^\d{5,25}$/u);

export const DiscordForumTagSchema = z.object({ id: snowflake, name: z.string().max(100) }).strict();

/** Fórum com as tags, como o Worker do Discord lê. */
export const DiscordForumDetailSchema = z
  .object({ id: snowflake, guildId: snowflake, tags: z.array(DiscordForumTagSchema).max(50) })
  .strict();

/** O que o painel precisa para publicar: fóruns, o escolhido e as tags dele. */
export const MissionDiscordViewSchema = z
  .object({
    forums: z.array(z.object({ id: snowflake, name: z.string().max(100) }).strict()),
    forum: DiscordForumDetailSchema.nullable(),
    /** Link do tópico, quando a missão já foi publicada. */
    threadUrl: z.string().url().nullable(),
  })
  .strict();

const MAX_DISCORD_CONTENT = 2_000;

export const MissionDiscordPublishInputSchema = z
  .object({
    forumChannelId: snowflake,
    tagIds: z.array(snowflake).max(5),
    content: z.string().trim().min(1).max(MAX_DISCORD_CONTENT),
    personaName: z.string().trim().min(1).max(80).nullable().default(null),
    personaAvatarUrl: z.string().url().startsWith("https://").max(2_048).nullable().default(null),
  })
  .strict();

/** Pedido do portal ao Worker do Discord, com a capa já lida do armazenamento. */
export const MissionDiscordPublishRequestSchema = MissionDiscordPublishInputSchema.extend({
  missionId: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  image: z
    .object({
      base64: z.string().max(Math.ceil((MEDIA_MAX_BYTES * 4) / 3) + 4),
      filename: z.string().regex(/^[\w.-]{1,80}$/u),
      contentType: z.enum(MEDIA_CONTENT_TYPES),
    })
    .strict()
    .nullable(),
}).strict();

export const MissionDiscordPublishResultSchema = z
  .object({ threadId: snowflake, guildId: snowflake })
  .strict();

const SAO_PAULO = "America/Sao_Paulo";

/** Data no formato do chamado: `08/10/2026 - 19h` (ou `19h30`). */
export function announcementDate(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("pt-BR", { timeZone: SAO_PAULO });
  const [hour = "00", minute = "00"] = date
    .toLocaleTimeString("pt-BR", { timeZone: SAO_PAULO, hour: "2-digit", minute: "2-digit", hour12: false })
    .split(":");
  return `${day} - ${hour}h${minute === "00" ? "" : minute}`;
}

/**
 * Texto do chamado no formato que a Ordem usa no Discord. O mestre pode
 * editar antes de publicar.
 */
export function missionAnnouncement(
  mission: Pick<MissionSummary, "id" | "title" | "region" | "summary" | "partySize" | "scheduledFor" | "estimatedDuration">,
  grade: string,
  siteUrl: string,
): string {
  const lines = [
    `🎯 ${mission.title}`,
    "",
    grade.trim() ? `Grau: ${grade.trim()}` : null,
    `Local: ${mission.region}`,
    `Participantes: ${mission.partySize} vagas`,
    mission.scheduledFor ? `Data: ${announcementDate(mission.scheduledFor)}` : null,
    mission.estimatedDuration ? `Duração estimada: ${mission.estimatedDuration}` : null,
    "",
    `Objetivo: ${mission.summary}`,
    "",
    `Inscrições no portal: ${siteUrl.replace(/\/+$/u, "")}/missoes/${mission.id}`,
  ].filter((line): line is string => line !== null);
  return lines.join("\n").slice(0, MAX_DISCORD_CONTENT);
}

export type DiscordForumTag = z.infer<typeof DiscordForumTagSchema>;
export type DiscordForumDetail = z.infer<typeof DiscordForumDetailSchema>;
export type MissionDiscordView = z.infer<typeof MissionDiscordViewSchema>;
export type MissionDiscordPublishInput = z.infer<typeof MissionDiscordPublishInputSchema>;
export type MissionDiscordPublishRequest = z.infer<typeof MissionDiscordPublishRequestSchema>;
export type MissionDiscordPublishResult = z.infer<typeof MissionDiscordPublishResultSchema>;
