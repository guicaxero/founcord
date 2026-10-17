ALTER TABLE `missions` ADD `number` integer;--> statement-breakpoint
ALTER TABLE `missions` ADD `outcome` text;--> statement-breakpoint
ALTER TABLE `missions` ADD `report` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `missions` ADD `recorded_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_missions_campaign_number` ON `missions` (`campaign_id`,`number`);