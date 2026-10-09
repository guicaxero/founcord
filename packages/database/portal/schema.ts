import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { roleNames } from "@ordem/authz";
import {
  campaignSessionStatuses,
  missionStatuses,
  postStatuses,
} from "@ordem/contracts";

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

export const campaignSessions = sqliteTable(
  "campaign_sessions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    missionId: text("mission_id").references(() => missions.id, {
      onDelete: "set null",
    }),
    masterUserId: text("master_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    status: text("status", { enum: campaignSessionStatuses })
      .notNull()
      .default("prepared"),
    worldId: text("world_id"),
    worldTitle: text("world_title"),
    discordReference: text("discord_reference"),
    notes: text("notes").notNull().default(""),
    capturedMessageCount: integer("captured_message_count").notNull().default(0),
    lastCapturedAt: text("last_captured_at"),
    transcriptTruncated: integer("transcript_truncated", { mode: "boolean" })
      .notNull()
      .default(false),
    automationJobId: text("automation_job_id"),
    captureError: text("capture_error"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("idx_campaign_sessions_campaign_created").on(
      table.campaignId,
      table.createdAt,
    ),
    index("idx_campaign_sessions_campaign_status").on(
      table.campaignId,
      table.status,
    ),
    index("idx_campaign_sessions_world_status").on(table.worldId, table.status),
    uniqueIndex("uq_campaign_sessions_active_world")
      .on(table.worldId)
      .where(sql`${table.worldId} IS NOT NULL AND ${table.status} IN ('starting', 'active')`),
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
    /** Capa (`media_assets.id`) e imagens extras, em ordem, como JSON. */
    coverMediaId: text("cover_media_id"),
    galleryJson: text("gallery_json").notNull().default("[]"),
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

/**
 * Imagens enviadas ao portal (capas e galerias), guardadas no bucket R2
 * `MEDIA` com a chave `r2_key`. O arquivo é público para quem tiver o link.
 */
export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    r2Key: text("r2_key").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    /** De onde veio: envio no painel ou cópia de um anexo do Discord. */
    origin: text("origin", { enum: ["upload", "discord"] }).notNull().default("upload"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_media_assets_r2_key").on(table.r2Key),
    index("idx_media_assets_campaign").on(table.campaignId, table.createdAt),
  ],
);

export const sessionSummaries = sqliteTable(
  "session_summaries",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => campaignSessions.id, {
      onDelete: "set null",
    }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["draft", "pending_review", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    source: text("source", { enum: ["manual", "automation"] })
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
    index("idx_session_summaries_campaign_status_published").on(
      table.campaignId,
      table.status,
      table.publishedAt,
    ),
    index("idx_session_summaries_session").on(table.sessionId),
  ],
);

export const automationSessionSummaryLinks = sqliteTable(
  "automation_session_summary_links",
  {
    jobId: text("job_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => campaignSessions.id, {
      onDelete: "set null",
    }),
    summaryId: text("summary_id")
      .notNull()
      .references(() => sessionSummaries.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_automation_session_summary_links_summary_id").on(table.summaryId),
    index("idx_automation_session_summary_links_campaign").on(
      table.campaignId,
      table.createdAt,
    ),
  ],
);

export const automationDraftLinks = sqliteTable(
  "automation_draft_links",
  {
    jobId: text("job_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_automation_draft_links_post_id").on(table.postId),
    index("idx_automation_draft_links_campaign").on(
      table.campaignId,
      table.createdAt,
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
    // Saldo do personagem (moedas do sistema demonlord); nulo até o módulo 0.6.0.
    wealthGc: integer("wealth_gc"),
    wealthSs: integer("wealth_ss"),
    wealthCp: integer("wealth_cp"),
    wealthBits: integer("wealth_bits"),
    portraitUrl: text("portrait_url"),
    tokenUrl: text("token_url"),
    // Ficha completa (atributos, inventário, magias…) a partir do módulo 0.11.0.
    sheetJson: text("sheet_json"),
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

export const campaignCharacterLinks = sqliteTable(
  "campaign_character_links",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    worldId: text("world_id").notNull(),
    foundryActorId: text("foundry_actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    // Tópico do Corvo no fórum Registro do Corvo do Discord.
    registroThreadId: text("registro_thread_id"),
    registroGuildId: text("registro_guild_id"),
    linkedByUserId: text("linked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_campaign_character_links_member").on(
      table.campaignId,
      table.userId,
    ),
    uniqueIndex("uq_campaign_character_links_actor").on(
      table.worldId,
      table.foundryActorId,
    ),
    index("idx_campaign_character_links_campaign").on(table.campaignId),
  ],
);

export const merchantPurchaseRequests = sqliteTable(
  "merchant_purchase_requests",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    requesterUserId: text("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    worldId: text("world_id").notNull(),
    buyerActorId: text("buyer_actor_id").notNull(),
    buyerActorName: text("buyer_actor_name").notNull(),
    merchantActorId: text("merchant_actor_id").notNull(),
    catalogSyncId: text("catalog_sync_id").notNull(),
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    priceSnapshot: text("price_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note"),
    status: text("status", {
      enum: [
        "pending_delivery",
        "awaiting_master",
        "delivery_failed",
        "fulfilled",
        "rejected",
        "cancelled",
      ],
    })
      .notNull()
      .default("pending_delivery"),
    commandId: text("command_id"),
    deliveryError: text("delivery_error"),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolutionNote: text("resolution_note"),
    resolvedAt: text("resolved_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_merchant_purchase_command").on(table.commandId),
    index("idx_merchant_purchase_campaign_status").on(
      table.campaignId,
      table.status,
      table.createdAt,
    ),
    index("idx_merchant_purchase_requester").on(
      table.requesterUserId,
      table.createdAt,
    ),
  ],
);

/**
 * Lista de itens que o Lojista pode vender. O sorteio lê daqui; o estoque real
 * continua no ator do Lojista no Foundry.
 */
export const merchantCatalogItems = sqliteTable(
  "merchant_catalog_items",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    kind: text("kind", { enum: ["weapon", "armor", "item"] }).notNull(),
    availability: text("availability", {
      enum: ["common", "uncommon", "rare", "exotic"],
    }).notNull(),
    price: text("price"),
    damage: text("damage"),
    hands: text("hands", { enum: ["one", "two", "off"] }),
    agility: text("agility"),
    fixed: text("fixed"),
    requirementAttribute: text("requirement_attribute", {
      enum: ["strength", "agility", "intellect", "will", "perception"],
    }),
    requirementMinimum: integer("requirement_minimum"),
    properties: text("properties"),
    description: text("description"),
    icon: text("icon"),
    source: text("source").notNull().default("lojista"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_merchant_catalog_name").on(table.campaignId, table.category, table.name),
    index("idx_merchant_catalog_draw").on(table.campaignId, table.active, table.availability),
  ],
);

/** Histórico dos sorteios de estoque, da prévia até a aplicação no Foundry. */
export const merchantStockDraws = sqliteTable(
  "merchant_stock_draws",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    mode: text("mode", { enum: ["draw", "manual"] }).notNull().default("draw"),
    criteriaJson: text("criteria_json").notNull(),
    entriesJson: text("entries_json").notNull(),
    eligibleCount: integer("eligible_count").notNull(),
    status: text("status", {
      enum: ["preview", "pending_delivery", "applied", "failed", "discarded"],
    })
      .notNull()
      .default("preview"),
    worldId: text("world_id"),
    commandId: text("command_id"),
    error: text("error"),
    appliedAt: text("applied_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_merchant_stock_command").on(table.commandId),
    index("idx_merchant_stock_campaign").on(table.campaignId, table.createdAt),
  ],
);

/**
 * Edições do estoque real do Lojista, item a item (`merchant.stock.patch`).
 * Guardam as mudanças enviadas e o resultado de cada uma no Foundry.
 */
export const merchantStockPatches = sqliteTable(
  "merchant_stock_patches",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    worldId: text("world_id").notNull(),
    operationsJson: text("operations_json").notNull(),
    outcomesJson: text("outcomes_json"),
    status: text("status", { enum: ["pending_delivery", "applied", "partial", "failed"] })
      .notNull()
      .default("pending_delivery"),
    commandId: text("command_id"),
    error: text("error"),
    appliedAt: text("applied_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_merchant_stock_patch_command").on(table.commandId),
    index("idx_merchant_stock_patch_campaign").on(table.campaignId, table.createdAt),
  ],
);

/**
 * Bestiário e grimório importados pelo mestre a partir do compêndio. É conteúdo
 * dos livros: só entra por importação e só aparece na área de gestão.
 */
export const compendiumEntries = sqliteTable(
  "compendium_entries",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["creature", "spell"] }).notNull(),
    sourceKey: text("source_key").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default(""),
    difficulty: integer("difficulty"),
    rank: integer("rank"),
    defense: integer("defense"),
    health: integer("health"),
    dataJson: text("data_json").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_compendium_entry_source").on(table.campaignId, table.kind, table.sourceKey),
    index("idx_compendium_entry_name").on(table.campaignId, table.kind, table.name),
  ],
);

/** Biblioteca de criaturas da campanha e sua situação no Foundry. */
export const creatures = sqliteTable(
  "creatures",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    dataJson: text("data_json").notNull(),
    basedOnEntryId: text("based_on_entry_id"),
    basedOnName: text("based_on_name"),
    version: integer("version").notNull().default(1),
    status: text("status", { enum: ["draft", "pending_delivery", "synced", "failed"] })
      .notNull()
      .default("draft"),
    sentVersion: integer("sent_version").notNull().default(0),
    worldId: text("world_id"),
    commandId: text("command_id"),
    foundryActorId: text("foundry_actor_id"),
    error: text("error"),
    sentAt: text("sent_at"),
    ...timestamps,
  },
  (table) => [index("idx_creatures_campaign").on(table.campaignId, table.updatedAt)],
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

/** Anotações do personagem editadas no portal, até o módulo gravar no Foundry. */
export const characterNoteUpdates = sqliteTable(
  "character_note_updates",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    worldId: text("world_id").notNull(),
    foundryActorId: text("foundry_actor_id").notNull(),
    text: text("text").notNull(),
    baseRevision: text("base_revision").notNull(),
    status: text("status", { enum: ["pending_delivery", "applied", "conflict", "failed"] })
      .notNull()
      .default("pending_delivery"),
    commandId: text("command_id"),
    error: text("error"),
    appliedAt: text("applied_at"),
    ...timestamps,
  },
  (table) => [index("idx_character_note_updates_owner").on(table.campaignId, table.userId, table.createdAt)],
);

/** Nível da Sede da Ordem em cada campanha (1 a 4). */
export const sedeSettings = sqliteTable("sede_settings", {
  campaignId: text("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  level: integer("level").notNull().default(1),
  ...timestamps,
});

/** Atividades da Vida na Sede, por campanha. */
export const sedeActivities = sqliteTable(
  "sede_activities",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    npc: text("npc").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    effect: text("effect").notNull(),
    minLevel: integer("min_level").notNull().default(1),
    inputMode: text("input_mode", { enum: ["none", "note", "question", "shop"] }).notNull().default("none"),
    roll: text("roll"),
    // Limite de valor da atividade do Lojista, como preço do Foundry ("1 ss").
    shopLimit: text("shop_limit"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sort: integer("sort").notNull().default(0),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [uniqueIndex("uq_sede_activity_name").on(table.campaignId, table.npc, table.name)],
);

/** Atividades escolhidas pelos Corvos e o resultado registrado pelo Guardião. */
export const sedeDeclarations = sqliteTable(
  "sede_declarations",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    worldId: text("world_id").notNull(),
    foundryActorId: text("foundry_actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    activityId: text("activity_id").notNull(),
    activityNpc: text("activity_npc").notNull(),
    activityName: text("activity_name").notNull(),
    activityEffect: text("activity_effect").notNull(),
    note: text("note"),
    rollJson: text("roll_json"),
    // Itens escolhidos na atividade do Lojista e a entrega no Foundry.
    itemsJson: text("items_json"),
    deliveryStatus: text("delivery_status", { enum: ["pending_delivery", "delivered", "failed"] }),
    deliveryError: text("delivery_error"),
    deliveryCommandId: text("delivery_command_id"),
    deliveredAt: text("delivered_at"),
    periodStartedAt: text("period_started_at"),
    status: text("status", { enum: ["declared", "resolved", "cancelled"] }).notNull().default("declared"),
    result: text("result"),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: text("resolved_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_sede_declarations_owner").on(table.campaignId, table.userId, table.createdAt),
    index("idx_sede_declarations_status").on(table.campaignId, table.status, table.createdAt),
  ],
);
