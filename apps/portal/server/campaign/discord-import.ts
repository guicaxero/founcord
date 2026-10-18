import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hasPermission, requirePermission } from "@ordem/authz";
import {
  DiscordForumListResponseSchema,
  DiscordForumThreadListResponseSchema,
  DiscordStarterMessageSchema,
  MAX_GALLERY_IMAGES,
  MEDIA_MAX_BYTES,
  type DiscordForum,
  type DiscordImportInput,
  type DiscordImportResult,
  type DiscordImportThread,
  type DiscordStarterMessage,
  type MissionDiscordImportInput,
  type MissionDiscordImportResult,
  missionRegionFrom,
  parseMissionThreadTitle,
} from "@ordem/contracts";
import type { z } from "zod";
import type { AuthenticatedSession } from "@/server/identity/session";
import { storeMedia } from "@/server/media/media";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";

/** Chamada ao Worker do Discord, que tem o token do bot. */
export async function discordWorker<T>(
  path: string,
  schema: z.ZodType<T>,
  correlationId: string,
  body?: unknown,
): Promise<T> {
  const { env } = getCloudflareContext();
  const token = process.env.INTEGRATION_SERVICE_TOKEN ?? env.INTEGRATION_SERVICE_TOKEN;
  const baseUrl =
    process.env.DISCORD_INTEGRATION_URL ??
    env.DISCORD_INTEGRATION_URL ??
    "https://ordem-discord-integration.ordem-da-ultima-luz.workers.dev";
  if (!token || token.length < 32) {
    throw new HttpError(503, "discord_integration_not_configured", "A conexão com o Discord ainda não está configurada.");
  }
  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-correlation-id": correlationId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new HttpError(503, "discord_integration_unavailable", "Não foi possível consultar o Discord agora. Tente novamente.");
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      "discord_read_failed",
      "O Discord não devolveu os dados. Confira se o bot vê o fórum e pode ler o histórico de mensagens.",
    );
  }
  return schema.parse(await response.json());
}

/** Ler os fóruns serve às crônicas (`post:create`) e aos registros de missão (`mission:publish`). */
function requireImporter(session: AuthenticatedSession, campaignId: string): void {
  if (hasPermission(session.principal, "mission:publish", { kind: "campaign", campaignId })) return;
  requirePermission(session.principal, "post:create", { kind: "campaign", campaignId });
}

export async function listDiscordForums(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<DiscordForum[]> {
  requireImporter(session, campaignId);
  return (await discordWorker("/internal/discord/forums", DiscordForumListResponseSchema, correlationId)).data;
}

/** Tópicos do fórum, com a crônica do portal que já veio de cada um. */
export async function listDiscordForumThreads(
  session: AuthenticatedSession,
  campaignId: string,
  forumChannelId: string,
  correlationId: string,
): Promise<DiscordImportThread[]> {
  requireImporter(session, campaignId);
  const threads = (
    await discordWorker(
      `/internal/discord/forums/${encodeURIComponent(forumChannelId)}/threads`,
      DiscordForumThreadListResponseSchema,
      correlationId,
    )
  ).data;
  const db = getD1();
  const [imported, missions] = await Promise.all([
    db
      .prepare("SELECT id, discord_thread_id FROM posts WHERE campaign_id = ? AND discord_thread_id IS NOT NULL")
      .bind(campaignId)
      .all<{ id: string; discord_thread_id: string }>(),
    db
      .prepare("SELECT id, discord_thread_id FROM missions WHERE campaign_id = ? AND discord_thread_id IS NOT NULL")
      .bind(campaignId)
      .all<{ id: string; discord_thread_id: string }>(),
  ]);
  const byThread = new Map(imported.results.map((row) => [row.discord_thread_id, row.id]));
  const missionByThread = new Map(missions.results.map((row) => [row.discord_thread_id, row.id]));
  return threads
    .map((thread) => ({
      ...thread,
      importedPostId: byThread.get(thread.threadId) ?? null,
      importedMissionId: missionByThread.get(thread.threadId) ?? null,
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** Corpo da crônica: o texto da mensagem inicial do tópico. */
export function importedBody(starter: Pick<DiscordStarterMessage, "content">): string {
  return (starter.content.trim() || "Crônica importada do Discord.").slice(0, 20_000);
}

/** Quem escreveu no Discord vira a assinatura, que o mestre pode trocar depois. */
export function importedByline(starter: Pick<DiscordStarterMessage, "authorName">): string | null {
  return starter.authorName.trim().slice(0, 80) || null;
}

export function importedTitle(title: string): string {
  const trimmed = title.trim().slice(0, 140);
  return trimmed.length >= 3 ? trimmed : "Crônica do Discord";
}

function isImage(attachment: DiscordStarterMessage["attachments"][number]): boolean {
  const looksLikeImage = attachment.contentType
    ? attachment.contentType.startsWith("image/")
    : /\.(png|jpe?g|gif|webp)$/iu.test(attachment.filename);
  return looksLikeImage && attachment.size <= MEDIA_MAX_BYTES;
}

/** Copia as imagens do Discord para o armazenamento do portal (os links de lá expiram). */
async function copyImages(
  campaignId: string,
  starter: DiscordStarterMessage,
  userId: string,
): Promise<Readonly<{ ids: string[]; failed: number }>> {
  const ids: string[] = [];
  let failed = 0;
  for (const attachment of starter.attachments.filter(isImage).slice(0, MAX_GALLERY_IMAGES + 1)) {
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`status ${response.status}`);
      ids.push((await storeMedia(campaignId, await response.arrayBuffer(), "discord", userId)).id);
    } catch {
      failed += 1;
    }
  }
  return { ids, failed };
}

/**
 * Importa tópicos como crônicas com origem Discord. Cada tópico vira uma
 * crônica só; a primeira imagem é a capa e as demais vão para a galeria.
 */
export async function importDiscordThreads(
  session: AuthenticatedSession,
  campaignId: string,
  input: DiscordImportInput,
  correlationId: string,
): Promise<DiscordImportResult> {
  requireImporter(session, campaignId);
  if (input.publish) requirePermission(session.principal, "post:publish", { kind: "campaign", campaignId });
  const publish = input.publish && hasPermission(session.principal, "post:publish", { kind: "campaign", campaignId });
  const db = getD1();
  const result: { imported: DiscordImportResult["imported"][number][]; skipped: DiscordImportResult["skipped"][number][] } = {
    imported: [],
    skipped: [],
  };

  for (const threadId of input.threadIds) {
    const existing = await db
      .prepare("SELECT id FROM posts WHERE campaign_id = ? AND discord_thread_id = ?")
      .bind(campaignId, threadId)
      .first<{ id: string }>();
    if (existing) {
      result.skipped.push({ threadId, reason: "Já está no portal." });
      continue;
    }
    let starter: DiscordStarterMessage;
    try {
      starter = await discordWorker(
        `/internal/discord/threads/${encodeURIComponent(threadId)}/starter`,
        DiscordStarterMessageSchema,
        correlationId,
      );
    } catch {
      result.skipped.push({ threadId, reason: "O Discord não devolveu a mensagem inicial deste tópico." });
      continue;
    }
    if (starter.forumChannelId !== input.forumChannelId) {
      result.skipped.push({ threadId, reason: "O tópico não é deste fórum." });
      continue;
    }
    if (!starter.content.trim() && starter.attachments.length === 0) {
      result.skipped.push({
        threadId,
        reason:
          "O Discord devolveu a mensagem vazia. Ative o Message Content Intent do bot no Discord Developer Portal e tente de novo.",
      });
      continue;
    }

    const images = await copyImages(campaignId, starter, session.user.id);
    const [cover = null, ...gallery] = images.ids;
    const id = crypto.randomUUID();
    const title = importedTitle(starter.title);
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO posts (
              id, campaign_id, author_user_id, title, body, source, status, reviewed_by, published_at,
              cover_media_id, gallery_json, discord_thread_id, byline
            ) VALUES (?, ?, ?, ?, ?, 'discord', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            campaignId,
            session.user.id,
            title,
            importedBody(starter),
            publish ? "published" : "draft",
            publish ? session.user.id : null,
            publish ? starter.createdAt : null,
            cover,
            JSON.stringify(gallery),
            threadId,
            importedByline(starter),
          ),
        prepareAudit(db, {
          actorUserId: session.user.id,
          campaignId,
          action: "post.imported",
          entityType: "post",
          entityId: id,
          correlationId,
          details: { threadId, forumChannelId: input.forumChannelId, images: images.ids.length, published: publish },
        }),
      ]);
    } catch {
      result.skipped.push({ threadId, reason: "Já está no portal." });
      continue;
    }
    result.imported.push({ threadId, postId: id, title, images: images.ids.length });
    if (images.failed > 0) {
      result.skipped.push({
        threadId,
        reason: `${images.failed} ${images.failed === 1 ? "imagem não pôde ser copiada" : "imagens não puderam ser copiadas"}; a crônica foi importada sem elas.`,
      });
    }
  }
  return result;
}

/**
 * Importa tópicos de um fórum (registros-das-missões) como missões publicadas
 * direto no registro. O título dá o número e o nome; a linha "Local:" dá a
 * região; a mensagem inicial é o chamado e o relato; a primeira imagem é a capa.
 */
export async function importMissionThreads(
  session: AuthenticatedSession,
  campaignId: string,
  input: MissionDiscordImportInput,
  correlationId: string,
): Promise<MissionDiscordImportResult> {
  requirePermission(session.principal, "mission:publish", { kind: "campaign", campaignId });
  const db = getD1();
  const result: MissionDiscordImportResult = { imported: [], skipped: [], notes: [] };

  for (const { threadId, outcome } of input.items) {
    const existing = await db
      .prepare("SELECT id FROM missions WHERE campaign_id = ? AND discord_thread_id = ?")
      .bind(campaignId, threadId)
      .first<{ id: string }>();
    if (existing) {
      result.skipped.push({ threadId, reason: "Já está no registro." });
      continue;
    }
    let starter: DiscordStarterMessage;
    try {
      starter = await discordWorker(
        `/internal/discord/threads/${encodeURIComponent(threadId)}/starter`,
        DiscordStarterMessageSchema,
        correlationId,
      );
    } catch {
      result.skipped.push({ threadId, reason: "O Discord não devolveu a mensagem inicial deste tópico." });
      continue;
    }
    if (starter.forumChannelId !== input.forumChannelId) {
      result.skipped.push({ threadId, reason: "O tópico não é deste fórum." });
      continue;
    }
    const content = starter.content.trim();
    if (!content) {
      result.skipped.push({
        threadId,
        reason:
          "O Discord devolveu a mensagem vazia. Ative o Message Content Intent do bot no Discord Developer Portal e tente de novo.",
      });
      continue;
    }

    const parsed = parseMissionThreadTitle(starter.title);
    const name = parsed.title.trim().slice(0, 100);
    const title = name.length >= 3 ? name : "Missão do Discord";
    // O resumo aparece como texto simples no quadro e no topo da página.
    const summary = content.replace(/\*\*|__/gu, "").slice(0, 1_200);
    let number = parsed.number;
    if (number !== null) {
      const taken = await db
        .prepare("SELECT 1 AS found FROM missions WHERE campaign_id = ? AND number = ?")
        .bind(campaignId, number)
        .first<{ found: number }>();
      if (taken) {
        result.notes.push({ threadId, note: `O número ${number} já estava no registro; a missão entrou sem número.` });
        number = null;
      }
    }
    const images = await copyImages(campaignId, { ...starter, attachments: starter.attachments.slice(0, 1) }, session.user.id);
    const id = crypto.randomUUID();
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO missions (
              id, campaign_id, author_user_id, title, summary, region, risk, party_size, status,
              published_at, cover_media_id, discord_thread_id, number, outcome, report, recorded_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'unknown', 5, 'published', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            campaignId,
            session.user.id,
            title,
            summary,
            missionRegionFrom(content) ?? "Não informada",
            starter.createdAt,
            images.ids[0] ?? null,
            threadId,
            number,
            outcome,
            content.length > 1_200 ? content.slice(0, 20_000) : "",
            starter.createdAt,
          ),
        prepareAudit(db, {
          actorUserId: session.user.id,
          campaignId,
          action: "mission.imported",
          entityType: "mission",
          entityId: id,
          correlationId,
          details: { threadId, forumChannelId: input.forumChannelId, outcome, number },
        }),
      ]);
    } catch {
      result.skipped.push({ threadId, reason: "Não foi possível gravar a missão. Tente de novo." });
      continue;
    }
    result.imported.push({ threadId, missionId: id, title, number, images: images.ids.length });
  }
  return result;
}
