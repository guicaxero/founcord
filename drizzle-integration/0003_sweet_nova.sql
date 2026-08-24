CREATE TABLE `foundry_pairing_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_code_hash` text NOT NULL,
	`user_code_hash` text NOT NULL,
	`world_instance_id` text NOT NULL,
	`foundry_world_id` text NOT NULL,
	`world_title` text NOT NULL,
	`system_id` text NOT NULL,
	`foundry_version` text NOT NULL,
	`system_version` text NOT NULL,
	`module_version` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`campaign_id` text,
	`campaign_name` text,
	`authorized_by_user_id` text,
	`world_id` text,
	`expires_at` text NOT NULL,
	`authorized_at` text,
	`cancelled_at` text,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `foundry_worlds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_pairing_device_code` ON `foundry_pairing_sessions` (`device_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_pairing_user_code` ON `foundry_pairing_sessions` (`user_code_hash`);--> statement-breakpoint
CREATE INDEX `idx_foundry_pairing_world_status` ON `foundry_pairing_sessions` (`world_instance_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_foundry_pairing_status_expiry` ON `foundry_pairing_sessions` (`status`,`expires_at`);