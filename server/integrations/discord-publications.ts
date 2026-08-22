import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { DiscordPostPublication, Post } from "@vigilia/contracts";

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
