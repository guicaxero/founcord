CREATE TABLE `merchant_purchase_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`requester_user_id` text NOT NULL,
	`world_id` text NOT NULL,
	`buyer_actor_id` text NOT NULL,
	`buyer_actor_name` text NOT NULL,
	`merchant_actor_id` text NOT NULL,
	`catalog_sync_id` text NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`price_snapshot` text NOT NULL,
	`quantity` integer NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending_delivery' NOT NULL,
	`command_id` text,
	`delivery_error` text,
	`resolved_by_user_id` text,
	`resolution_note` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requester_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_merchant_purchase_command` ON `merchant_purchase_requests` (`command_id`);
--> statement-breakpoint
CREATE INDEX `idx_merchant_purchase_campaign_status` ON `merchant_purchase_requests` (`campaign_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_merchant_purchase_requester` ON `merchant_purchase_requests` (`requester_user_id`,`created_at`);
