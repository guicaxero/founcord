CREATE TABLE `session_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`session_id` text,
	`author_user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`reviewed_by` text,
	`published_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `campaign_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_session_summaries_campaign_status_published` ON `session_summaries` (`campaign_id`,`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_session_summaries_session` ON `session_summaries` (`session_id`);--> statement-breakpoint
CREATE TABLE `automation_session_summary_links` (
	`job_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`session_id` text,
	`summary_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `campaign_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`summary_id`) REFERENCES `session_summaries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_automation_session_summary_links_summary_id` ON `automation_session_summary_links` (`summary_id`);--> statement-breakpoint
CREATE INDEX `idx_automation_session_summary_links_campaign` ON `automation_session_summary_links` (`campaign_id`,`created_at`);
