CREATE TABLE `foundry_merchant_catalogs` (
	`world_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`merchant_actor_id` text NOT NULL,
	`merchant_name` text NOT NULL,
	`sync_id` text NOT NULL,
	`captured_at` text NOT NULL,
	`source_updated_at` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`items_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `foundry_worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_merchant_sync_id` ON `foundry_merchant_catalogs` (`sync_id`);--> statement-breakpoint
CREATE INDEX `idx_foundry_merchant_campaign_captured` ON `foundry_merchant_catalogs` (`campaign_id`,`captured_at`);