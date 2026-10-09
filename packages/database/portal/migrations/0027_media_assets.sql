CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`created_by_user_id` text,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`origin` text DEFAULT 'upload' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_media_assets_r2_key` ON `media_assets` (`r2_key`);--> statement-breakpoint
CREATE INDEX `idx_media_assets_campaign` ON `media_assets` (`campaign_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `posts` ADD `cover_media_id` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `gallery_json` text DEFAULT '[]' NOT NULL;