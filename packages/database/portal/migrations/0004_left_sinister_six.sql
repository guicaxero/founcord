CREATE TABLE `discord_post_links` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`forum_channel_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`starter_message_id` text,
	`published_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_discord_post_links_post_id` ON `discord_post_links` (`post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_discord_post_links_thread_id` ON `discord_post_links` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_discord_post_links_campaign_id` ON `discord_post_links` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `integration_inbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`external_event_id` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`result_entity_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integration_inbox_external_event` ON `integration_inbox_events` (`source`,`external_event_id`);--> statement-breakpoint
CREATE INDEX `idx_integration_inbox_status` ON `integration_inbox_events` (`source`,`status`);