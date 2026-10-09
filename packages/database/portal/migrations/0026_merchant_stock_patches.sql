CREATE TABLE `merchant_stock_patches` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`world_id` text NOT NULL,
	`operations_json` text NOT NULL,
	`outcomes_json` text,
	`status` text DEFAULT 'pending_delivery' NOT NULL,
	`command_id` text,
	`error` text,
	`applied_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_merchant_stock_patch_command` ON `merchant_stock_patches` (`command_id`);--> statement-breakpoint
CREATE INDEX `idx_merchant_stock_patch_campaign` ON `merchant_stock_patches` (`campaign_id`,`created_at`);