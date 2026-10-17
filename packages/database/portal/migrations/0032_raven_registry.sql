CREATE TABLE `mission_participants` (
	`mission_id` text NOT NULL,
	`raven_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`mission_id`, `raven_id`),
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raven_id`) REFERENCES `ravens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mission_participants_raven` ON `mission_participants` (`raven_id`);--> statement-breakpoint
CREATE TABLE `ravens` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text,
	`world_id` text,
	`foundry_actor_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`listed` integer DEFAULT true NOT NULL,
	`image_media_id` text,
	`name` text,
	`player_name` text,
	`ancestry` text,
	`novice_path` text,
	`expert_path` text,
	`master_path` text,
	`level` integer,
	`sessions_played` integer,
	`missions_completed` integer,
	`missions_failed` integer,
	`last_mission` text,
	`activities` text,
	`attributes_json` text,
	`stats_json` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ravens_actor` ON `ravens` (`campaign_id`,`world_id`,`foundry_actor_id`);--> statement-breakpoint
CREATE INDEX `idx_ravens_campaign` ON `ravens` (`campaign_id`,`listed`);--> statement-breakpoint
-- Todo personagem já vinculado ganha seu Corvo no registro.
INSERT INTO `ravens` (`id`, `campaign_id`, `user_id`, `world_id`, `foundry_actor_id`)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))),
  `campaign_id`, `user_id`, `world_id`, `foundry_actor_id`
FROM `campaign_character_links`;
