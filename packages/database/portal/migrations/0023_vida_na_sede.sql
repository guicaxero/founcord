CREATE TABLE `sede_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`npc` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`effect` text NOT NULL,
	`min_level` integer DEFAULT 1 NOT NULL,
	`input_mode` text DEFAULT 'none' NOT NULL,
	`roll` text,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sede_activity_name` ON `sede_activities` (`campaign_id`,`npc`,`name`);--> statement-breakpoint
CREATE TABLE `sede_declarations` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`world_id` text NOT NULL,
	`foundry_actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`activity_id` text NOT NULL,
	`activity_npc` text NOT NULL,
	`activity_name` text NOT NULL,
	`activity_effect` text NOT NULL,
	`note` text,
	`roll_json` text,
	`period_started_at` text,
	`status` text DEFAULT 'declared' NOT NULL,
	`result` text,
	`resolved_by_user_id` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_sede_declarations_owner` ON `sede_declarations` (`campaign_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sede_declarations_status` ON `sede_declarations` (`campaign_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `sede_settings` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
