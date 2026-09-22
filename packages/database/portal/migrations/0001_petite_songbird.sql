CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`campaign_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `iam_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_campaign_created` ON `audit_log` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_actor_created` ON `audit_log` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_correlation_id` ON `audit_log` (`correlation_id`);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `is_public` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mission_signups` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `iam_sessions` ADD `last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `iam_users` (
  `id`, `discord_user_id`, `display_name`, `avatar_url`
) VALUES (
  '00000000-0000-4000-8000-000000000000',
  '__system__',
  'Vigília do Último Farol',
  NULL
);--> statement-breakpoint
INSERT OR IGNORE INTO `campaigns` (
  `id`, `slug`, `name`, `description`, `status`, `is_public`, `version`
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'vigilia-do-ultimo-farol',
  'Vigília do Último Farol',
  'Campanha West Marches de Shadow of the Demon Lord.',
  'active',
  1,
  1
);--> statement-breakpoint
INSERT OR IGNORE INTO `missions` (
  `id`, `campaign_id`, `author_user_id`, `title`, `summary`, `region`,
  `status`, `risk`, `scheduled_for`, `party_size`, `published_at`, `version`
) VALUES
(
  '22222222-2222-4222-8222-222222222221',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'Sinos sob a lama',
  'Uma capela afundada voltou a tocar durante a madrugada. O povo de Rûmora quer respostas antes da próxima lua.',
  'Brejo de Gath',
  'published',
  'dangerous',
  '2026-08-23T19:00:00-03:00',
  5,
  CURRENT_TIMESTAMP,
  1
),
(
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'A estrada das efígies',
  'Mercadores desapareceram na antiga rota do norte. Restaram apenas estátuas de sal voltadas para o Farol.',
  'Estrada Cinzenta',
  'published',
  'moderate',
  '2026-08-27T19:00:00-03:00',
  5,
  CURRENT_TIMESTAMP,
  1
),
(
  '22222222-2222-4222-8222-222222222223',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'O cartógrafo sem rosto',
  'Um mapa impossível circula nas tavernas. Suas trilhas mudam toda noite, mas sempre terminam no mesmo nome.',
  'Ermos do Poente',
  'published',
  'unknown',
  NULL,
  5,
  CURRENT_TIMESTAMP,
  1
);
