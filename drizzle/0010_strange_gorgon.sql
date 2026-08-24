CREATE TABLE `automation_draft_links` (
	`job_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`post_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_automation_draft_links_post_id` ON `automation_draft_links` (`post_id`);--> statement-breakpoint
CREATE INDEX `idx_automation_draft_links_campaign` ON `automation_draft_links` (`campaign_id`,`created_at`);