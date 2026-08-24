import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  automationJobStatuses,
  automationKinds,
  automationSourceKinds,
} from "@vigilia/contracts";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const automationJobs = sqliteTable(
  "automation_jobs",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    requestedByUserId: text("requested_by_user_id").notNull(),
    requestedByName: text("requested_by_name").notNull(),
    kind: text("kind", { enum: automationKinds }).notNull(),
    status: text("status", { enum: automationJobStatuses })
      .notNull()
      .default("queued"),
    sourceKind: text("source_kind", { enum: automationSourceKinds }).notNull(),
    sourceLabel: text("source_label"),
    sourceContent: text("source_content").notNull(),
    suggestedTitle: text("suggested_title"),
    instructions: text("instructions"),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id").notNull(),
    postId: text("post_id"),
    resultTitle: text("result_title"),
    resultBody: text("result_body"),
    model: text("model"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    leaseToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_automation_jobs_idempotency").on(table.idempotencyKey),
    uniqueIndex("uq_automation_jobs_post_id").on(table.postId),
    uniqueIndex("uq_automation_jobs_lease_token").on(table.leaseToken),
    index("idx_automation_jobs_campaign_created").on(
      table.campaignId,
      table.createdAt,
    ),
    index("idx_automation_jobs_dispatch").on(
      table.status,
      table.leaseExpiresAt,
      table.createdAt,
    ),
  ],
);

export const automationDailyUsage = sqliteTable("automation_daily_usage", {
  day: text("day").primaryKey(),
  jobsCreated: integer("jobs_created").notNull().default(0),
  jobsCompleted: integer("jobs_completed").notNull().default(0),
  inputCharacters: integer("input_characters").notNull().default(0),
  outputCharacters: integer("output_characters").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
