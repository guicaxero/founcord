CREATE TABLE `foundry_capture_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `foundry_worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_foundry_capture_campaign_created` ON `foundry_capture_sessions` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_foundry_capture_world_status` ON `foundry_capture_sessions` (`world_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_capture_active_world` ON `foundry_capture_sessions` (`world_id`) WHERE "foundry_capture_sessions"."status" = 'active';--> statement-breakpoint
CREATE TABLE `foundry_chat_events` (
	`id` text PRIMARY KEY NOT NULL,
	`capture_session_id` text NOT NULL,
	`world_id` text NOT NULL,
	`message_id` text NOT NULL,
	`source_created_at` text NOT NULL,
	`author_user_id` text,
	`author_name` text NOT NULL,
	`speaker_actor_id` text,
	`speaker_name` text,
	`message_kind` text NOT NULL,
	`content` text NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`capture_session_id`) REFERENCES `foundry_capture_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`world_id`) REFERENCES `foundry_worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_foundry_chat_world_message` ON `foundry_chat_events` (`world_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `idx_foundry_chat_capture_created` ON `foundry_chat_events` (`capture_session_id`,`source_created_at`);--> statement-breakpoint
CREATE INDEX `idx_foundry_chat_retention` ON `foundry_chat_events` (`received_at`);