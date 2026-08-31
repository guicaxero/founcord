ALTER TABLE `automation_jobs` ADD `target_json` text DEFAULT '{"type":"post"}' NOT NULL;
ALTER TABLE `automation_jobs` ADD `summary_id` text;
