-- Remove os termos inventados do conteúdo semeado nas migrations 0001 e 0003.
-- Os slugs são preservados porque identificam a campanha em referências existentes.
UPDATE `campaigns`
SET `description` = 'Campanha de Shadow of the Demon Lord ambientada em Urth, no ano 888 DF.',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `description` LIKE '%West Marches%';
--> statement-breakpoint
UPDATE `campaigns`
SET `name` = 'Ordem da Última Luz',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `slug` = 'vigilia-do-ultimo-farol';
--> statement-breakpoint
UPDATE `iam_users`
SET `display_name` = 'Ordem da Última Luz',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `discord_user_id` = '__system__'
  AND `display_name` = 'Vigília do Último Farol';
