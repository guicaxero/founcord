ALTER TABLE `posts` ADD `discord_thread_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_posts_campaign_discord_thread` ON `posts` (`campaign_id`,`discord_thread_id`);