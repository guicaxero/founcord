import type { Post } from "@vigilia/contracts";
import type { DiscordThread } from "./discord-client";
import type { IntegrationEnv } from "./types";

type InboxRow = Readonly<{
  status: "processing" | "succeeded" | "failed";
  result_entity_id: string | null;
  attempts: number;
}>;

type DeliveryRow = Readonly<{
  status: "pending" | "succeeded" | "failed";
  external_id: string | null;
}>;

type DiscordPostTargetRow = Readonly<{
  campaign_id: string;
  guild_id: string;
  forum_channel_id: string;
}>;

export type DiscordPostTarget = Readonly<{
  campaignId: string;
  guildId: string;
  forumChannelId: string;
}>;

export type InboxClaim =
  | Readonly<{ status: "claimed" }>
  | Readonly<{ status: "processing" }>
  | Readonly<{ status: "failed" }>
  | Readonly<{ status: "succeeded"; postId: string | null }>;

export async function claimDiscordInteraction(
  env: IntegrationEnv,
  interactionId: string,
): Promise<InboxClaim> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO integration_inbox_events (
      id, source, external_event_id, status, attempts
    ) VALUES (?, 'discord', ?, 'processing', 0)`,
  )
    .bind(crypto.randomUUID(), interactionId)
    .run();
  const claim = await env.DB.prepare(
    `UPDATE integration_inbox_events
     SET status = 'processing', attempts = attempts + 1, last_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE source = 'discord' AND external_event_id = ?
       AND attempts < 3
       AND (status = 'failed' OR (status = 'processing' AND attempts = 0))`,
  )
    .bind(interactionId)
    .run();
  if ((claim.meta.changes ?? 0) > 0) return { status: "claimed" };

  const row = await env.DB.prepare(
    `SELECT status, result_entity_id, attempts
     FROM integration_inbox_events
     WHERE source = 'discord' AND external_event_id = ?`,
  )
    .bind(interactionId)
    .first<InboxRow>();
  if (!row) throw new Error("Could not claim Discord interaction.");
  if (row.status === "succeeded") {
    return { status: "succeeded", postId: row.result_entity_id };
  }
  return { status: row.status };
}

export async function completeDiscordInteraction(
  env: IntegrationEnv,
  interactionId: string,
  postId: string,
  target: DiscordPostTarget,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE integration_inbox_events
       SET status = 'succeeded', result_entity_id = ?, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE source = 'discord' AND external_event_id = ?`,
    ).bind(postId, interactionId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO discord_post_targets (
        id, post_id, interaction_id, campaign_id, guild_id, forum_channel_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      postId,
      interactionId,
      target.campaignId,
      target.guildId,
      target.forumChannelId,
    ),
  ]);
}

export async function failDiscordInteraction(
  env: IntegrationEnv,
  interactionId: string,
  error: unknown,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE integration_inbox_events
     SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE source = 'discord' AND external_event_id = ?`,
  )
    .bind(errorMessage(error), interactionId)
    .run();
}

export async function hasDiscordPostLink(
  env: IntegrationEnv,
  postId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 AS linked FROM discord_post_links WHERE post_id = ?",
  )
    .bind(postId)
    .first<{ linked: number }>();
  return Boolean(row?.linked);
}

export async function getDiscordPostTarget(
  env: IntegrationEnv,
  postId: string,
): Promise<DiscordPostTarget> {
  const row = await env.DB.prepare(
    `SELECT campaign_id, guild_id, forum_channel_id
     FROM discord_post_targets
     WHERE post_id = ?`,
  )
    .bind(postId)
    .first<DiscordPostTargetRow>();
  if (!row) throw new Error("Discord publication target was not found.");
  return {
    campaignId: row.campaign_id,
    guildId: row.guild_id,
    forumChannelId: row.forum_channel_id,
  };
}

export async function beginDiscordDelivery(
  env: IntegrationEnv,
  postId: string,
): Promise<"deliver" | "succeeded"> {
  const key = deliveryKey(postId);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO integration_deliveries (
      id, destination, idempotency_key, status
    ) VALUES (?, 'discord', ?, 'pending')`,
  )
    .bind(crypto.randomUUID(), key)
    .run();
  const row = await env.DB.prepare(
    `SELECT status, external_id
     FROM integration_deliveries
     WHERE destination = 'discord' AND idempotency_key = ?`,
  )
    .bind(key)
    .first<DeliveryRow>();
  if (row?.status === "succeeded") return "succeeded";
  await env.DB.prepare(
    `UPDATE integration_deliveries
     SET status = 'pending', attempts = attempts + 1, last_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE destination = 'discord' AND idempotency_key = ?`,
  )
    .bind(key)
    .run();
  return "deliver";
}

export async function completeDiscordPublication(
  env: IntegrationEnv,
  post: Post,
  thread: DiscordThread,
  target: DiscordPostTarget,
  correlationId: string,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE integration_deliveries
       SET status = 'succeeded', external_id = ?, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE destination = 'discord' AND idempotency_key = ?`,
    ).bind(thread.id, deliveryKey(post.id)),
    env.DB.prepare(
      `INSERT OR IGNORE INTO discord_post_links (
        id, post_id, campaign_id, guild_id, forum_channel_id, thread_id,
        starter_message_id, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      post.id,
      post.campaignId,
      target.guildId,
      target.forumChannelId,
      thread.id,
      thread.messageId,
      new Date().toISOString(),
    ),
    env.DB.prepare(
      `INSERT INTO audit_log (
        id, actor_user_id, campaign_id, action, entity_type, entity_id,
        correlation_id, details_json
      ) VALUES (?, NULL, ?, 'discord.post.published', 'discord_thread', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      post.campaignId,
      thread.id,
      correlationId,
      JSON.stringify({
        postId: post.id,
        guildId: target.guildId,
        forumChannelId: target.forumChannelId,
        starterMessageId: thread.messageId,
      }),
    ),
  ]);
}

export async function failDiscordDelivery(
  env: IntegrationEnv,
  postId: string,
  error: unknown,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE integration_deliveries
     SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE destination = 'discord' AND idempotency_key = ?`,
  )
    .bind(errorMessage(error), deliveryKey(postId))
    .run();
}

function deliveryKey(postId: string): string {
  return `post:${postId}:forum:v1`;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown error").slice(0, 1_000);
}
