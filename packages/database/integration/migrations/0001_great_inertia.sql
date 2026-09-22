CREATE TABLE `foundry_actor_links` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`last_sync_id` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `foundry_worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_actor_links_world_actor` ON `foundry_actor_links` (`world_id`,`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_foundry_actor_links_sync` ON `foundry_actor_links` (`world_id`,`last_sync_id`);--> statement-breakpoint
CREATE TABLE `foundry_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`command_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	`lease_token` text,
	`lease_expires_at` text,
	`result_json` text,
	`last_error` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `foundry_worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_commands_idempotency` ON `foundry_commands` (`world_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_commands_lease_token` ON `foundry_commands` (`lease_token`);--> statement-breakpoint
CREATE INDEX `idx_foundry_commands_dispatch` ON `foundry_commands` (`world_id`,`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `foundry_worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`world_instance_id` text NOT NULL,
	`foundry_world_id` text NOT NULL,
	`world_title` text NOT NULL,
	`system_id` text NOT NULL,
	`foundry_version` text NOT NULL,
	`system_version` text NOT NULL,
	`module_version` text NOT NULL,
	`access_token_hash` text NOT NULL,
	`access_token_prefix` text NOT NULL,
	`last_seen_at` text,
	`active_users` integer DEFAULT 0 NOT NULL,
	`actor_count` integer DEFAULT 0 NOT NULL,
	`revoked_at` text,
	`registered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_worlds_instance_id` ON `foundry_worlds` (`world_instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_worlds_access_token_hash` ON `foundry_worlds` (`access_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_foundry_worlds_campaign_seen` ON `foundry_worlds` (`campaign_id`,`last_seen_at`);