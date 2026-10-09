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
} from "@ordem/contracts";
import type { z } from "zod";
import type { AuthenticatedSession } from "@/server/identity/session";
import { storeMedia } from "@/server/media/media";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";

/** Leitura no Worker do Discord, que tem o token do bot. */
async function discordWorker<T>(path: string, schema: z.ZodType<T>, correlationId: string): Promise<T> {
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
      headers: { authorization: `Bearer ${token}`, "x-correlation-id": correlationId },
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

function requireImporter(session: AuthenticatedSession, campaignId: string): void {
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
  const imported = await getD1()
    .prepare("SELECT id, discord_thread_id FROM posts WHERE campaign_id = ? AND discord_thread_id IS NOT NULL")
    .bind(campaignId)
    .all<{ id: string; discord_thread_id: string }>();
  const byThread = new Map(imported.results.map((row) => [row.discord_thread_id, row.id]));
  return threads
    .map((thread) => ({ ...thread, importedPostId: byThread.get(thread.threadId) ?? null }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()<>#+\-.!|])/g, "\\$1");
}

/** Corpo da crônica: quem escreveu no Discord, como no `/post`, e o texto. */
export function importedBody(starter: Pick<DiscordStarterMessage, "authorName" | "content">): string {
  const author = starter.authorName.trim();
  const body = [author ? `> Escrito por **${escapeMarkdown(author)}**` : null, starter.content.trim() || null]
    .filter(Boolean)
    .join("\n\n");
  return (body || "Crônica importada do Discord.").slice(0, 20_000);
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
              cover_media_id, gallery_json, discord_thread_id
            ) VALUES (?, ?, ?, ?, ?, 'discord', ?, ?, ?, ?, ?, ?)`,
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
