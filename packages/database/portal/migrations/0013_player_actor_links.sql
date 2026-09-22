CREATE TABLE `campaign_character_links` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`world_id` text NOT NULL,
	`foundry_actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`linked_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaign_character_links_member` ON `campaign_character_links` (`campaign_id`,`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaign_character_links_actor` ON `campaign_character_links` (`world_id`,`foundry_actor_id`);
--> statement-breakpoint
CREATE INDEX `idx_campaign_character_links_campaign` ON `campaign_character_links` (`campaign_id`);
