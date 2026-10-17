ALTER TABLE `posts` ADD `byline` text;--> statement-breakpoint
ALTER TABLE `iam_users` ADD `discord_name` text;--> statement-breakpoint
ALTER TABLE `iam_users` ADD `portal_name` text;--> statement-breakpoint
-- O nome atual vem do Discord; guardá-lo permite voltar a ele quando a pessoa
-- apagar o nome escolhido no portal.
UPDATE `iam_users` SET `discord_name` = `display_name` WHERE `discord_name` IS NULL;
--> statement-breakpoint
-- Crônicas importadas do Discord ou criadas pelo /post traziam a autoria no
-- texto ("> Escrito por **Fulano**"); ela passa para a assinatura.
UPDATE `posts`
SET
  `byline` = replace(substr(`body`, 17, instr(substr(`body`, 17), '**') - 1), '\', ''),
  `body` = CASE
    WHEN length(trim(ltrim(substr(`body`, 18 + instr(substr(`body`, 17), '**')), char(10, 13)))) > 0
      THEN ltrim(substr(`body`, 18 + instr(substr(`body`, 17), '**')), char(10, 13))
    ELSE `body`
  END
WHERE `byline` IS NULL
  AND `body` LIKE '> Escrito por **%'
  AND instr(substr(`body`, 17), '**') > 1;
--> statement-breakpoint
-- O autor das crônicas oficiais é o usuário de sistema; o "AP" ao lado do nome
-- não fazia parte do título.
UPDATE `iam_users`
SET `display_name` = 'Guardião da Chama',
    `portal_name` = 'Guardião da Chama',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = '00000000-0000-4000-8000-000000000000'
  AND `discord_user_id` = '__system__'
  AND `display_name` = 'Guardião da Chama AP';
