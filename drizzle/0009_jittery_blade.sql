CREATE TABLE `foundry_sync_cursors` (
	`world_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`last_sync_id` text NOT NULL,
	`last_captured_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_foundry_sync_cursor_campaign` ON `foundry_sync_cursors` (`campaign_id`);