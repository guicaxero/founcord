CREATE TABLE `compendium_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_key` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`difficulty` integer,
	`rank` integer,
	`defense` integer,
	`health` integer,
	`data_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_compendium_entry_source` ON `compendium_entries` (`campaign_id`,`kind`,`source_key`);--> statement-breakpoint
CREATE INDEX `idx_compendium_entry_name` ON `compendium_entries` (`campaign_id`,`kind`,`name`);--> statement-breakpoint
CREATE TABLE `creatures` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`name` text NOT NULL,
	`data_json` text NOT NULL,
	`based_on_entry_id` text,
	`based_on_name` text,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_version` integer DEFAULT 0 NOT NULL,
	`world_id` text,
	`command_id` text,
	`foundry_actor_id` text,
	`error` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_creatures_campaign` ON `creatures` (`campaign_id`,`updated_at`);