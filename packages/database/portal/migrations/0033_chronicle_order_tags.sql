ALTER TABLE `posts` ADD `pinned_order` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `tags_json` text DEFAULT '[]' NOT NULL;