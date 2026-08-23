import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { roleNames } from "@vigilia/authz";
import { missionStatuses, postStatuses } from "@vigilia/contracts";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable(
  "iam_users",
  {
    id: text("id").primaryKey(),
    discordUserId: text("discord_user_id").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_iam_users_discord_user_id").on(table.discordUserId),
  ],
);

export const sessions = sqliteTable(
  "iam_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_iam_sessions_user_id").on(table.userId)],
);

export const roleAssignments = sqliteTable(
  "iam_role_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleName: text("role_name", { enum: roleNames }).notNull(),
    scopeKind: text("scope_kind", {
      enum: ["global", "campaign"],
    }).notNull(),
    scopeId: text("scope_id").notNull(),
    grantedBy: text("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_iam_role_assignment_scope").on(
      table.userId,
      table.roleName,
      table.scopeKind,
      table.scopeId,
    ),
    index("idx_iam_role_assignments_user_id").on(table.userId),
  ],
);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", {
      enum: ["draft", "active", "archived"],
    })
      .notNull()
      .default("draft"),
    isPublic: integer("is_public", { mode: "boolean" })
      .notNull()
      .default(true),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_campaigns_slug").on(table.slug),
    index("idx_campaigns_public_status").on(table.status, table.isPublic),
  ],
);

export const campaignMembers = sqliteTable(
  "campaign_members",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["active", "suspended", "left"],
    })
      .notNull()
      .default("active"),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.userId] }),
    index("idx_campaign_members_user_id").on(table.userId),
  ],
);

export const missions = sqliteTable(
  "missions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    region: text("region").notNull(),
    status: text("status", { enum: missionStatuses })
      .notNull()
      .default("draft"),
    risk: text("risk", {
      enum: ["unknown", "moderate", "dangerous", "deadly"],
    })
      .notNull()
      .default("unknown"),
    scheduledFor: text("scheduled_for"),
    partySize: integer("party_size").notNull().default(5),
    publishedAt: text("published_at"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("idx_missions_campaign_status_published").on(
      table.campaignId,
      table.status,
      table.publishedAt,
    ),
    index("idx_missions_author_user_id").on(table.authorUserId),
  ],
);

export const missionSignups = sqliteTable(
  "mission_signups",
  {
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["confirmed", "waitlisted", "withdrawn"],
    })
      .notNull()
      .default("confirmed"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.missionId, table.userId] }),
    index("idx_mission_signups_user_id").on(table.userId),
  ],
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: postStatuses })
      .notNull()
      .default("draft"),
    source: text("source", {
      enum: ["manual", "discord", "foundry", "automation"],
    })
      .notNull()
      .default("manual"),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: text("published_at"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("idx_posts_campaign_status_published").on(
      table.campaignId,
      table.status,
      table.publishedAt,
    ),
  ],
);

export const foundryCharacterProjections = sqliteTable(
  "foundry_character_projections",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    worldId: text("world_id").notNull(),
    foundryActorId: text("foundry_actor_id").notNull(),
    name: text("name").notNull(),
    ownerUserIdsJson: text("owner_user_ids_json").notNull().default("[]"),
    level: integer("level").notNull().default(0),
    ancestry: text("ancestry"),
    novicePath: text("novice_path"),
    expertPath: text("expert_path"),
    masterPath: text("master_path"),
    legendaryPath: text("legendary_path"),
    healthMax: integer("health_max").notNull().default(0),
    damage: integer("damage").notNull().default(0),
    healingRate: integer("healing_rate").notNull().default(0),
    insanity: integer("insanity").notNull().default(0),
    corruption: integer("corruption").notNull().default(0),
    sourceUpdatedAt: text("source_updated_at").notNull(),
    lastSyncedAt: text("last_synced_at").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_foundry_character_world_actor").on(
      table.worldId,
      table.foundryActorId,
    ),
    index("idx_foundry_character_campaign_active").on(
      table.campaignId,
      table.isActive,
      table.name,
    ),
  ],
);

export const foundrySyncCursors = sqliteTable(
  "foundry_sync_cursors",
  {
    worldId: text("world_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    lastSyncId: text("last_sync_id").notNull(),
    lastCapturedAt: text("last_captured_at").notNull(),
    ...timestamps,
  },
  (table) => [index("idx_foundry_sync_cursor_campaign").on(table.campaignId)],
);

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    occurredAt: text("occurred_at").notNull(),
    publishedAt: text("published_at"),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [
    index("idx_outbox_events_unpublished").on(
      table.publishedAt,
      table.occurredAt,
    ),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    detailsJson: text("details_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_audit_log_campaign_created").on(
      table.campaignId,
      table.createdAt,
    ),
    index("idx_audit_log_actor_created").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("idx_audit_log_correlation_id").on(table.correlationId),
  ],
);
