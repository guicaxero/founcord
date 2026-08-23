import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const integrationDeliveries = sqliteTable(
  "integration_deliveries",
  {
    id: text("id").primaryKey(),
    destination: text("destination", {
      enum: ["discord", "foundry", "automation"],
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    externalId: text("external_id"),
    status: text("status", {
      enum: ["pending", "succeeded", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_integration_deliveries_idempotency").on(
      table.destination,
      table.idempotencyKey,
    ),
    index("idx_integration_deliveries_status").on(
      table.destination,
      table.status,
    ),
  ],
);

export const integrationInboxEvents = sqliteTable(
  "integration_inbox_events",
  {
    id: text("id").primaryKey(),
    source: text("source", {
      enum: ["discord", "foundry", "automation"],
    }).notNull(),
    externalEventId: text("external_event_id").notNull(),
    status: text("status", {
      enum: ["processing", "succeeded", "failed"],
    })
      .notNull()
      .default("processing"),
    resultEntityId: text("result_entity_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_integration_inbox_external_event").on(
      table.source,
      table.externalEventId,
    ),
    index("idx_integration_inbox_status").on(table.source, table.status),
  ],
);

export const discordPostTargets = sqliteTable(
  "discord_post_targets",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    interactionId: text("interaction_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    discordUserId: text("discord_user_id").notNull(),
    guildId: text("guild_id").notNull(),
    forumChannelId: text("forum_channel_id").notNull(),
    forumTagId: text("forum_tag_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_discord_post_targets_post_id").on(table.postId),
    uniqueIndex("uq_discord_post_targets_interaction_id").on(
      table.interactionId,
    ),
    index("idx_discord_post_targets_campaign_forum").on(
      table.campaignId,
      table.forumChannelId,
    ),
  ],
);

export const discordPostLinks = sqliteTable(
  "discord_post_links",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    guildId: text("guild_id").notNull(),
    forumChannelId: text("forum_channel_id").notNull(),
    forumTagId: text("forum_tag_id"),
    threadId: text("thread_id").notNull(),
    starterMessageId: text("starter_message_id"),
    publishedAt: text("published_at").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_discord_post_links_post_id").on(table.postId),
    uniqueIndex("uq_discord_post_links_thread_id").on(table.threadId),
    index("idx_discord_post_links_campaign_id").on(table.campaignId),
  ],
);
