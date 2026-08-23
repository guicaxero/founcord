CREATE TABLE `foundry_character_projections` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`world_id` text NOT NULL,
	`foundry_actor_id` text NOT NULL,
	`name` text NOT NULL,
	`owner_user_ids_json` text DEFAULT '[]' NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`ancestry` text,
	`novice_path` text,
	`expert_path` text,
	`master_path` text,
	`legendary_path` text,
	`health_max` integer DEFAULT 0 NOT NULL,
	`damage` integer DEFAULT 0 NOT NULL,
	`healing_rate` integer DEFAULT 0 NOT NULL,
	`insanity` integer DEFAULT 0 NOT NULL,
	`corruption` integer DEFAULT 0 NOT NULL,
	`source_updated_at` text NOT NULL,
	`last_synced_at` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_character_world_actor` ON `foundry_character_projections` (`world_id`,`foundry_actor_id`);--> statement-breakpoint
CREATE INDEX `idx_foundry_character_campaign_active` ON `foundry_character_projections` (`campaign_id`,`is_active`,`name`);