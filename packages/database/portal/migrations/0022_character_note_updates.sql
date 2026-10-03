CREATE TABLE `character_note_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`world_id` text NOT NULL,
	`foundry_actor_id` text NOT NULL,
	`text` text NOT NULL,
	`base_revision` text NOT NULL,
	`status` text DEFAULT 'pending_delivery' NOT NULL,
	`command_id` text,
	`error` text,
	`applied_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_character_note_updates_owner` ON `character_note_updates` (`campaign_id`,`user_id`,`created_at`);