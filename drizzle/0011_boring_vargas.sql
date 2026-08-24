CREATE TABLE `campaign_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`mission_id` text,
	`master_user_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`world_id` text,
	`world_title` text,
	`discord_reference` text,
	`notes` text DEFAULT '' NOT NULL,
	`captured_message_count` integer DEFAULT 0 NOT NULL,
	`last_captured_at` text,
	`transcript_truncated` integer DEFAULT false NOT NULL,
	`automation_job_id` text,
	`capture_error` text,
	`started_at` text,
	`ended_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`master_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_sessions_campaign_created` ON `campaign_sessions` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_campaign_sessions_campaign_status` ON `campaign_sessions` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_campaign_sessions_world_status` ON `campaign_sessions` (`world_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaign_sessions_active_world` ON `campaign_sessions` (`world_id`) WHERE "campaign_sessions"."world_id" IS NOT NULL AND "campaign_sessions"."status" IN ('starting', 'active');