import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  DiscordPostPublication,
  DiscordPostPublishedNotification,
  Post,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";

export function enqueueDiscordPublication(
  post: Post,
  correlationId: string,
): void {
  const { env, ctx } = getCloudflareContext();
  const queue = env.DISCORD_PUBLICATIONS;
  if (!queue) {
    console.warn(
      JSON.stringify({
        level: "warn",
        code: "discord_publication_queue_unavailable",
        postId: post.id,
        correlationId,
      }),
    );
    return;
  }

  const message: DiscordPostPublication = {
    type: "discord.post.publish",
    version: 1,
    postId: post.id,
    campaignId: post.campaignId,
    correlationId,
  };
  ctx.waitUntil(
    queue.send(message).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: "error",
          code: "discord_publication_enqueue_failed",
          postId: post.id,
          correlationId,
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }),
  );
}

export async function recordDiscordPublication(
  input: DiscordPostPublishedNotification,
  correlationId: string,
): Promise<void> {
  const db = getD1();
  const result = await db
    .prepare(
      `INSERT INTO audit_log (
        id, actor_user_id, campaign_id, action, entity_type, entity_id,
        correlation_id, details_json
      )
      SELECT ?, NULL, ?, 'discord.post.published', 'discord_thread', ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM posts WHERE id = ? AND campaign_id = ?
      ) AND NOT EXISTS (
        SELECT 1 FROM audit_log
        WHERE action = 'discord.post.published'
          AND entity_type = 'discord_thread' AND entity_id = ?
      )`,
    )
    .bind(
      crypto.randomUUID(),
      input.campaignId,
      input.threadId,
      correlationId,
      JSON.stringify({
        postId: input.postId,
        guildId: input.guildId,
        forumChannelId: input.forumChannelId,
        forumTagId: input.forumTagId,
        starterMessageId: input.starterMessageId,
        publishedAt: input.publishedAt,
      }),
      input.postId,
      input.campaignId,
      input.threadId,
    )
    .run();
  if ((result.meta.changes ?? 0) > 0) return;

  const existingPost = await db
    .prepare("SELECT 1 AS found FROM posts WHERE id = ? AND campaign_id = ?")
    .bind(input.postId, input.campaignId)
    .first<{ found: number }>();
  if (!existingPost) {
    throw new HttpError(404, "post_not_found", "O post publicado não existe no portal.");
  }
}
