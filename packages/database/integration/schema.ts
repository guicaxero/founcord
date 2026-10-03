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
    personaName: text("persona_name"),
    personaAvatarUrl: text("persona_avatar_url"),
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

export const foundryWorlds = sqliteTable(
  "foundry_worlds",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    worldInstanceId: text("world_instance_id").notNull(),
    foundryWorldId: text("foundry_world_id").notNull(),
    worldTitle: text("world_title").notNull(),
    systemId: text("system_id", { enum: ["demonlord"] }).notNull(),
    foundryVersion: text("foundry_version").notNull(),
    systemVersion: text("system_version").notNull(),
    moduleVersion: text("module_version").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    accessTokenPrefix: text("access_token_prefix").notNull(),
    lastSeenAt: text("last_seen_at"),
    activeUsers: integer("active_users").notNull().default(0),
    actorCount: integer("actor_count").notNull().default(0),
    revokedAt: text("revoked_at"),
    registeredAt: text("registered_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_foundry_worlds_instance_id").on(table.worldInstanceId),
    uniqueIndex("uq_foundry_worlds_access_token_hash").on(table.accessTokenHash),
    index("idx_foundry_worlds_campaign_seen").on(
      table.campaignId,
      table.lastSeenAt,
    ),
  ],
);

export const foundryEnrollmentTokens = sqliteTable(
  "foundry_enrollment_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    worldId: text("world_id").references(() => foundryWorlds.id, {
      onDelete: "set null",
    }),
    claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    consumedAt: text("consumed_at"),
  },
  (table) => [index("idx_foundry_enrollment_world").on(table.worldId)],
);

export const foundryPairingSessions = sqliteTable(
  "foundry_pairing_sessions",
  {
    id: text("id").primaryKey(),
    deviceCodeHash: text("device_code_hash").notNull(),
    userCodeHash: text("user_code_hash").notNull(),
    requestKeyHash: text("request_key_hash"),
    worldInstanceId: text("world_instance_id").notNull(),
    foundryWorldId: text("foundry_world_id").notNull(),
    worldTitle: text("world_title").notNull(),
    systemId: text("system_id", { enum: ["demonlord"] }).notNull(),
    foundryVersion: text("foundry_version").notNull(),
    systemVersion: text("system_version").notNull(),
    moduleVersion: text("module_version").notNull(),
    status: text("status", {
      enum: ["pending", "authorized", "cancelled", "expired"],
    })
      .notNull()
      .default("pending"),
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    authorizedByUserId: text("authorized_by_user_id"),
    worldId: text("world_id").references(() => foundryWorlds.id, {
      onDelete: "set null",
    }),
    expiresAt: text("expires_at").notNull(),
    authorizedAt: text("authorized_at"),
    cancelledAt: text("cancelled_at"),
    consumedAt: text("consumed_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_foundry_pairing_device_code").on(table.deviceCodeHash),
    uniqueIndex("uq_foundry_pairing_user_code").on(table.userCodeHash),
    index("idx_foundry_pairing_world_status").on(
      table.worldInstanceId,
      table.status,
    ),
    index("idx_foundry_pairing_status_expiry").on(table.status, table.expiresAt),
    index("idx_foundry_pairing_request_created").on(table.requestKeyHash, table.createdAt),
  ],
);

export const foundryCommands = sqliteTable(
  "foundry_commands",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => foundryWorlds.id, { onDelete: "cascade" }),
    commandType: text("command_type", {
      enum: ["actor.sync.request", "chat.message.create", "merchant.purchase.request", "merchant.stock.replace", "creature.upsert", "character.notes.update"],
    }).notNull(),
    payloadJson: text("payload_json").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: ["pending", "dispatched", "succeeded", "failed", "expired"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
    resultJson: text("result_json"),
    lastError: text("last_error"),
    completedAt: text("completed_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_foundry_commands_idempotency").on(
      table.worldId,
      table.idempotencyKey,
    ),
    uniqueIndex("uq_foundry_commands_lease_token").on(table.leaseToken),
    index("idx_foundry_commands_dispatch").on(
      table.worldId,
      table.status,
      table.availableAt,
    ),
  ],
);

export const foundryActorLinks = sqliteTable(
  "foundry_actor_links",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => foundryWorlds.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    lastSyncId: text("last_sync_id").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_foundry_actor_links_world_actor").on(
      table.worldId,
      table.actorId,
    ),
    index("idx_foundry_actor_links_sync").on(table.worldId, table.lastSyncId),
  ],
);

export const foundryMerchantCatalogs = sqliteTable(
  "foundry_merchant_catalogs",
  {
    worldId: text("world_id")
      .primaryKey()
      .references(() => foundryWorlds.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull(),
    merchantActorId: text("merchant_actor_id").notNull(),
    merchantName: text("merchant_name").notNull(),
    syncId: text("sync_id").notNull(),
    capturedAt: text("captured_at").notNull(),
    sourceUpdatedAt: text("source_updated_at").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    itemsJson: text("items_json").notNull().default("[]"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_foundry_merchant_sync_id").on(table.syncId),
    index("idx_foundry_merchant_campaign_captured").on(
      table.campaignId,
      table.capturedAt,
    ),
  ],
);

export const foundryCaptureSessions = sqliteTable(
  "foundry_capture_sessions",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => foundryWorlds.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull(),
    status: text("status", { enum: ["active", "ended", "cancelled"] })
      .notNull()
      .default("active"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: text("last_message_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_foundry_capture_campaign_created").on(
      table.campaignId,
      table.createdAt,
    ),
    index("idx_foundry_capture_world_status").on(table.worldId, table.status),
    uniqueIndex("uq_foundry_capture_active_world")
      .on(table.worldId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const foundryChatEvents = sqliteTable(
  "foundry_chat_events",
  {
    id: text("id").primaryKey(),
    captureSessionId: text("capture_session_id")
      .notNull()
      .references(() => foundryCaptureSessions.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => foundryWorlds.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    sourceCreatedAt: text("source_created_at").notNull(),
    authorUserId: text("author_user_id"),
    authorName: text("author_name").notNull(),
    speakerActorId: text("speaker_actor_id"),
    speakerName: text("speaker_name"),
    messageKind: text("message_kind", { enum: ["message", "roll"] }).notNull(),
    content: text("content").notNull(),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_foundry_chat_world_message").on(table.worldId, table.messageId),
    index("idx_foundry_chat_capture_created").on(
      table.captureSessionId,
      table.sourceCreatedAt,
    ),
    index("idx_foundry_chat_retention").on(table.receivedAt),
  ],
);
