CREATE TABLE `discord_post_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`interaction_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`forum_channel_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_discord_post_targets_post_id` ON `discord_post_targets` (`post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_discord_post_targets_interaction_id` ON `discord_post_targets` (`interaction_id`);--> statement-breakpoint
CREATE INDEX `idx_discord_post_targets_campaign_forum` ON `discord_post_targets` (`campaign_id`,`forum_channel_id`);