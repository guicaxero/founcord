CREATE INDEX `idx_campaigns_public_status` ON `campaigns` (`status`,`is_public`);--> statement-breakpoint
PRAGMA optimize;
