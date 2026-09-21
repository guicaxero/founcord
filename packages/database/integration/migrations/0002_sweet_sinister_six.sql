CREATE TABLE `foundry_enrollment_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`world_id` text,
	`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`consumed_at` text,
	FOREIGN KEY (`world_id`) REFERENCES `foundry_worlds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_foundry_enrollment_world` ON `foundry_enrollment_tokens` (`world_id`);