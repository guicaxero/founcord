# Marco 2.5 — Isolamento de persistência

## Objetivo

Remover o acesso do Integration Worker ao banco do portal antes de introduzir
conexões Foundry. A separação preserva IDs, tentativas e associações existentes
do Discord sem copiar sessões ou conteúdo editorial.

## Ownership

| Banco | Tabelas |
| --- | --- |
| `ordem-da-ultima-luz` | `iam_*`, campanhas, membros, missões, inscrições, posts, auditoria e outbox |
| `ordem-integration-db` | `integration_*`, `discord_post_targets` e `discord_post_links` |

O binding do portal permanece `DB`. O Integration Worker usa apenas
`INTEGRATION_DB` e o Service Binding `PORTAL`.

## Contratos entre serviços

- a interação Discord envia `discordUserId` ao portal para autenticação e RBAC;
- o Integration Worker armazena esse ID junto do destino do post, sem consultar
  `iam_users` posteriormente;
- o conteúdo publicado é lido pelo endpoint interno do portal;
- depois de criar o tópico, a integração envia uma notificação idempotente ao
  portal, que grava `discord.post.published` na própria auditoria;
- retries encontram `discord_post_links` antes de chamar o Discord, impedindo
  tópicos duplicados.

## Provisionamento

Renove a sessão do Wrangler e crie o banco uma única vez:

```bash
bunx wrangler login
bunx wrangler d1 create ordem-integration-db
```

Registre o `database_id` retornado em
`services/integration/wrangler.jsonc` e aplique a migration própria:

```bash
bun run db:migrate:integration:remote
```

## Migração dos dados

O script lê somente as quatro tabelas legadas, resolve `discord_user_id` ainda
na origem e não exporta sessões, usuários, títulos ou corpos de posts.

Primeiro simule:

```bash
bun run db:migrate:integration-data
```

Depois copie de forma idempotente:

```bash
bun run db:migrate:integration-data:apply
```

O script usa `INSERT OR REPLACE`, pode ser repetido e compara as contagens no
destino. Execute uma primeira cópia antes do corte e outra imediatamente após o
deploy da integração, quando o banco legado já não receber novas gravações.

## Ordem do corte

1. Criar e migrar `ordem-integration-db`.
2. Simular e executar a primeira cópia.
3. Publicar o Portal Worker com o callback interno idempotente.
4. Publicar o Integration Worker com `INTEGRATION_DB`.
5. Repetir a cópia para capturar o delta anterior ao corte.
6. Validar `/health`, `/post`, revisão, publicação e ausência de duplicidade.
7. Aplicar `bun run db:migrate:remote` para remover as tabelas legadas do banco
   do portal somente depois da validação.

## Rollback

Antes da etapa 7, reverta o Integration Worker para a versão anterior e seu
binding antigo. Depois da etapa 7, restaure o banco do portal com D1 Time Travel
ou reaplique as tabelas e faça a cópia inversa a partir do banco de integração.

Não exclua `ordem-integration-db` durante um rollback: ele é a cópia preservada
dos registros técnicos e não contém credenciais do portal.

## Verificação

- o Integration Worker não possui binding para o banco do portal;
- nenhum SQL da integração menciona `iam_*`, `posts` ou `audit_log`;
- `discord_post_targets` contém `discord_user_id`;
- uma nova entrega cria exatamente um `discord_post_links`;
- reenviar o mesmo evento não cria outro tópico;
- `discord.post.published` aparece uma única vez na auditoria do portal;
- os quatro counts migrados são iguais ou maiores no destino.
