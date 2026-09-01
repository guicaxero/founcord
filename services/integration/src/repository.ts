import {
  MerchantCatalogResponseSchema,
  MerchantItemProjectionSchema,
  type MerchantCatalogResponse,
  type Post,
} from "@vigilia/contracts";
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
  attempts: number;
}>;

type DiscordPostTargetRow = Readonly<{
  campaign_id: string;
  guild_id: string;
  forum_channel_id: string;
  forum_tag_id: string | null;
  discord_user_id: string;
  persona_name: string | null;
  persona_avatar_url: string | null;
}>;

type DiscordPostLinkRow = Readonly<{
  post_id: string;
  campaign_id: string;
  guild_id: string;
  forum_channel_id: string;
  forum_tag_id: string | null;
  thread_id: string;
  starter_message_id: string | null;
  published_at: string;
}>;

export type DiscordPostTarget = Readonly<{
  campaignId: string;
  guildId: string;
  forumChannelId: string;
  forumTagId: string | null;
  discordUserId: string;
  personaName: string | null;
  personaAvatarUrl: string | null;
}>;

export type NewDiscordPostTarget = DiscordPostTarget;

export type DiscordPostLink = Readonly<{
  postId: string;
  campaignId: string;
  guildId: string;
  forumChannelId: string;
  forumTagId: string | null;
  threadId: string;
  starterMessageId: string | null;
  publishedAt: string;
}>;

export type InboxClaim =
  | Readonly<{ status: "claimed" }>
  | Readonly<{ status: "processing" }>
  | Readonly<{ status: "failed" }>
  | Readonly<{ status: "succeeded"; postId: string | null }>;

type MerchantCatalogRow = Readonly<{
  campaign_id: string;
  last_seen_at: string | null;
  connection_status: "online" | "offline";
  merchant_name: string | null;
  captured_at: string | null;
  items_json: string | null;
}>;

export async function getDiscordMerchantCatalog(
  env: IntegrationEnv,
  campaignId: string,
): Promise<MerchantCatalogResponse> {
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT fw.campaign_id, fw.last_seen_at,
            CASE
              WHEN fw.last_seen_at IS NOT NULL
                AND (unixepoch('now') - unixepoch(fw.last_seen_at)) <= 90
                THEN 'online'
              ELSE 'offline'
            END AS connection_status,
            mc.merchant_name, mc.captured_at, mc.items_json
     FROM foundry_worlds fw
     LEFT JOIN foundry_merchant_catalogs mc ON mc.world_id = fw.id
     WHERE fw.campaign_id = ? AND fw.revoked_at IS NULL
     ORDER BY
       CASE WHEN mc.world_id IS NULL THEN 1 ELSE 0 END,
       CASE
         WHEN fw.last_seen_at IS NOT NULL
           AND (unixepoch('now') - unixepoch(fw.last_seen_at)) <= 90
           THEN 0
         ELSE 1
       END,
       mc.captured_at DESC,
       fw.registered_at DESC
     LIMIT 1`,
  )
    .bind(campaignId)
    .first<MerchantCatalogRow>();
  if (!row) {
    return MerchantCatalogResponseSchema.parse({
      campaignId,
      connection: { status: "not_connected", lastSeenAt: null },
      catalog: null,
    });
  }
  const capturedAt = row.captured_at ? normalizeD1Date(row.captured_at) : null;
  const isStale = capturedAt
    ? Date.now() - Date.parse(capturedAt) > 15 * 60 * 1_000
    : true;
  return MerchantCatalogResponseSchema.parse({
    campaignId: row.campaign_id,
    connection: {
      status: row.connection_status,
      lastSeenAt: row.last_seen_at ? normalizeD1Date(row.last_seen_at) : null,
    },
    catalog:
      row.merchant_name && capturedAt && row.items_json
        ? {
            merchantName: row.merchant_name,
            syncedAt: capturedAt,
            freshness:
              row.connection_status === "offline"
                ? "offline"
                : isStale
                  ? "stale"
                  : "fresh",
            items: MerchantItemProjectionSchema.array()
              .max(500)
              .parse(JSON.parse(row.items_json)),
          }
        : null,
  });
}

export async function claimDiscordInteraction(
  env: IntegrationEnv,
  interactionId: string,
): Promise<InboxClaim> {
  await env.INTEGRATION_DB.prepare(
    `INSERT OR IGNORE INTO integration_inbox_events (
      id, source, external_event_id, status, attempts
    ) VALUES (?, 'discord', ?, 'processing', 0)`,
  )
    .bind(crypto.randomUUID(), interactionId)
    .run();
  const claim = await env.INTEGRATION_DB.prepare(
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

  const row = await env.INTEGRATION_DB.prepare(
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
  target: NewDiscordPostTarget,
): Promise<void> {
  await env.INTEGRATION_DB.batch([
    env.INTEGRATION_DB.prepare(
      `UPDATE integration_inbox_events
       SET status = 'succeeded', result_entity_id = ?, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE source = 'discord' AND external_event_id = ?`,
    ).bind(postId, interactionId),
    env.INTEGRATION_DB.prepare(
      `INSERT OR IGNORE INTO discord_post_targets (
        id, post_id, interaction_id, campaign_id, guild_id, forum_channel_id,
        forum_tag_id, discord_user_id, persona_name, persona_avatar_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      postId,
      interactionId,
      target.campaignId,
      target.guildId,
      target.forumChannelId,
      target.forumTagId,
      target.discordUserId,
      target.personaName,
      target.personaAvatarUrl,
    ),
  ]);
}

export async function failDiscordInteraction(
  env: IntegrationEnv,
  interactionId: string,
  error: unknown,
): Promise<void> {
  await env.INTEGRATION_DB.prepare(
    `UPDATE integration_inbox_events
     SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE source = 'discord' AND external_event_id = ?`,
  )
    .bind(errorMessage(error), interactionId)
    .run();
}

export async function getDiscordPostLink(
  env: IntegrationEnv,
  postId: string,
): Promise<DiscordPostLink | null> {
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT post_id, campaign_id, guild_id, forum_channel_id, forum_tag_id,
            thread_id, starter_message_id, published_at
     FROM discord_post_links WHERE post_id = ?`,
  )
    .bind(postId)
    .first<DiscordPostLinkRow>();
  return row
    ? {
        postId: row.post_id,
        campaignId: row.campaign_id,
        guildId: row.guild_id,
        forumChannelId: row.forum_channel_id,
        forumTagId: row.forum_tag_id,
        threadId: row.thread_id,
        starterMessageId: row.starter_message_id,
        publishedAt: row.published_at,
      }
    : null;
}

export async function getDiscordPostTarget(
  env: IntegrationEnv,
  postId: string,
): Promise<DiscordPostTarget> {
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT campaign_id, guild_id, forum_channel_id, forum_tag_id,
            discord_user_id, persona_name, persona_avatar_url
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
    forumTagId: row.forum_tag_id,
    discordUserId: row.discord_user_id,
    personaName: row.persona_name ?? null,
    personaAvatarUrl: row.persona_avatar_url ?? null,
  };
}

export async function beginDiscordDelivery(
  env: IntegrationEnv,
  postId: string,
): Promise<"deliver" | "succeeded"> {
  const key = deliveryKey(postId);
  await env.INTEGRATION_DB.prepare(
    `INSERT OR IGNORE INTO integration_deliveries (
      id, destination, idempotency_key, status
    ) VALUES (?, 'discord', ?, 'pending')`,
  )
    .bind(crypto.randomUUID(), key)
    .run();
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT status, external_id
     FROM integration_deliveries
     WHERE destination = 'discord' AND idempotency_key = ?`,
  )
    .bind(key)
    .first<DeliveryRow>();
  if (row?.status === "succeeded") return "succeeded";
  await env.INTEGRATION_DB.prepare(
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
  publishedAt: string,
): Promise<void> {
  await env.INTEGRATION_DB.batch([
    env.INTEGRATION_DB.prepare(
      `UPDATE integration_deliveries
       SET status = 'succeeded', external_id = ?, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE destination = 'discord' AND idempotency_key = ?`,
    ).bind(thread.id, deliveryKey(post.id)),
    env.INTEGRATION_DB.prepare(
      `INSERT OR IGNORE INTO discord_post_links (
        id, post_id, campaign_id, guild_id, forum_channel_id, thread_id,
        starter_message_id, published_at, forum_tag_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      post.id,
      post.campaignId,
      target.guildId,
      target.forumChannelId,
      thread.id,
      thread.messageId,
      publishedAt,
      target.forumTagId,
    ),
  ]);
}

export async function failDiscordDelivery(
  env: IntegrationEnv,
  postId: string,
  error: unknown,
): Promise<void> {
  await env.INTEGRATION_DB.prepare(
    `UPDATE integration_deliveries
     SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE destination = 'discord' AND idempotency_key = ?`,
  )
    .bind(errorMessage(error), deliveryKey(postId))
    .run();
}

export async function getDiscordDeliveryAttempts(
  env: IntegrationEnv,
  postId: string,
): Promise<number> {
  const row = await env.INTEGRATION_DB.prepare(
    `SELECT attempts
     FROM integration_deliveries
     WHERE destination = 'discord' AND idempotency_key = ?`,
  )
    .bind(deliveryKey(postId))
    .first<Pick<DeliveryRow, "attempts">>();
  return row?.attempts ?? 0;
}

function deliveryKey(postId: string): string {
  return `post:${postId}:forum:v1`;
}

function normalizeD1Date(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toISOString();
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown error").slice(0, 1_000);
}
