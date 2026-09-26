CREATE TABLE `merchant_catalog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`availability` text NOT NULL,
	`price` text,
	`damage` text,
	`hands` text,
	`agility` text,
	`fixed` text,
	`requirement_attribute` text,
	`requirement_minimum` integer,
	`properties` text,
	`description` text,
	`icon` text,
	`source` text DEFAULT 'lojista' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_merchant_catalog_name` ON `merchant_catalog_items` (`campaign_id`,`category`,`name`);--> statement-breakpoint
CREATE INDEX `idx_merchant_catalog_draw` ON `merchant_catalog_items` (`campaign_id`,`active`,`availability`);--> statement-breakpoint
CREATE TABLE `merchant_stock_draws` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`criteria_json` text NOT NULL,
	`entries_json` text NOT NULL,
	`eligible_count` integer NOT NULL,
	`status` text DEFAULT 'preview' NOT NULL,
	`world_id` text,
	`command_id` text,
	`error` text,
	`applied_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_merchant_stock_command` ON `merchant_stock_draws` (`command_id`);--> statement-breakpoint
CREATE INDEX `idx_merchant_stock_campaign` ON `merchant_stock_draws` (`campaign_id`,`created_at`);