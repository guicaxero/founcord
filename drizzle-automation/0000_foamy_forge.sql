CREATE TABLE `automation_daily_usage` (
	`day` text PRIMARY KEY NOT NULL,
	`jobs_created` integer DEFAULT 0 NOT NULL,
	`jobs_completed` integer DEFAULT 0 NOT NULL,
	`input_characters` integer DEFAULT 0 NOT NULL,
	`output_characters` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`requested_by_name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`source_kind` text NOT NULL,
	`source_label` text,
	`source_content` text NOT NULL,
	`suggested_title` text,
	`instructions` text,
	`idempotency_key` text NOT NULL,
	`correlation_id` text NOT NULL,
	`post_id` text,
	`result_title` text,
	`result_body` text,
	`model` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	`error_code` text,
	`error_message` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_automation_jobs_idempotency` ON `automation_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_automation_jobs_post_id` ON `automation_jobs` (`post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_automation_jobs_lease_token` ON `automation_jobs` (`lease_token`);--> statement-breakpoint
CREATE INDEX `idx_automation_jobs_campaign_created` ON `automation_jobs` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_automation_jobs_dispatch` ON `automation_jobs` (`status`,`lease_expires_at`,`created_at`);