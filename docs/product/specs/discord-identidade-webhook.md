# Discord — identidade narrativa por webhook

## Objetivo

Permitir que uma publicação criada por `/post` apareça no fórum com o nome e o
avatar opcionais do personagem, NPC ou narrador, sem substituir o bot nos
comandos e sem expor tokens de webhook ao Portal ou ao navegador.

## Usuário e fluxo

1. A pessoa escolhe o fórum e a tag no comando `/post`.
2. O modal solicita título, conteúdo, nome narrativo opcional e URL HTTPS de
   avatar opcional.
3. O Portal cria o Post privado e mantém a autoria narrativa legível no corpo.
4. Depois da revisão humana e publicação, o Worker de integração procura um
   webhook gerenciado pela aplicação no fórum.
5. Quando houver identidade personalizada, o webhook cria o tópico usando
   `username`, `avatar_url`, `thread_name` e `applied_tags`.
6. Sem identidade personalizada, ou se a gestão de webhooks estiver
   indisponível, a integração usa o bot e preserva a atribuição textual.

## Limites de segurança

- O token do webhook nunca atravessa o contrato com o Portal, a Queue ou logs.
- A integração não armazena URL completa de webhook; consulta ou cria o recurso
  usando o Bot Token já protegido no Worker.
- Somente webhooks de entrada pertencentes à aplicação e ao fórum informado
  podem ser reutilizados.
- O avatar aceita somente URL HTTPS, com limite de 2.048 caracteres.
- `allowed_mentions.parse` permanece vazio para conteúdo fornecido por usuário.
- A falta de `MANAGE_WEBHOOKS` não impede a publicação: ativa fallback para o
  bot e produz log estruturado sem credenciais.
- O fluxo permanece assíncrono, idempotente e condicionado à publicação humana
  no Portal.

## Contrato e persistência

`CreateDiscordPostDraft` recebe `personaAvatarUrl` opcional. O Integration D1
armazena em `discord_post_targets`:

- `persona_name`;
- `persona_avatar_url`.

O Post continua sendo a fonte do título e do conteúdo revisados. Metadados de
entrega não são copiados para o banco principal.

## Compatibilidade

- Registros anteriores à migration possuem identidade nula e continuam usando
  o bot.
- Modal legado `v1` e modal atual `v2` continuam sendo aceitos durante a
  transição; o novo modal usa `v3`.
- Nenhuma configuração manual de URL de webhook é necessária.

## Estados e mensagens

- **Campos inválidos:** a resposta efêmera explica que nome/avatar devem ser
  revisados.
- **Aguardando revisão:** a prévia continua exibindo o título e o conteúdo.
- **Webhook disponível:** o cabeçalho no tópico usa a identidade narrativa.
- **Webhook indisponível:** o tópico é criado pelo bot com atribuição textual;
  não há perda de conteúdo.
- **Falha total:** segue o retry e a DLQ já existentes.

## Critérios de aceitação

1. Nome personalizado aparece como `username` do webhook e não apenas no corpo.
2. Avatar HTTPS opcional aparece como `avatar_url` do webhook.
3. Título, corpo, tag e CTA do Portal permanecem na publicação.
4. Nenhuma menção é expandida automaticamente.
5. Sem `MANAGE_WEBHOOKS`, um único tópico ainda é publicado pelo bot.
6. Entregas repetidas não criam um novo tópico depois do vínculo persistido.
7. Tokens e URLs executáveis de webhook não aparecem no D1, contratos ou logs.
8. Contratos, migrations, bundles e testes de integração passam antes do merge.

## Referências oficiais

- [Webhook Resource — Discord](https://docs.discord.com/developers/resources/webhook)
- [Permissions — Discord](https://docs.discord.com/developers/topics/permissions)
