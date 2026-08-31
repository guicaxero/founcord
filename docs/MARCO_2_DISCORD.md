# Marco 2 — Discord

## Objetivo

Receber o comando `/post` por HTTP, criar um rascunho editorial no portal e,
somente após revisão e publicação humanas, replicar o conteúdo em um canal de
fórum do Discord.

## Fluxo

```text
/post forum:<canal de fórum>
  -> Discord Interaction HTTP
  -> seletor nativo limitado a canais GUILD_FORUM
  -> modal e resposta diferida efêmera
  -> Discord Integration Worker
  -> Portal Worker por Service Binding
  -> post pending_review
  -> revisão humana no painel
  -> post published
  -> Cloudflare Queue
  -> Discord Integration Worker
  -> tópico no fórum Discord
```

O modal também aceita nome narrativo e avatar HTTPS opcionais. Depois da
revisão, a integração usa um webhook de entrada gerenciado pela própria
aplicação para criar o tópico com `username` e `avatar_url` personalizados. O
bot continua responsável pelos comandos, validações, DMs e fallback.

O Discord Integration Worker valida a assinatura Ed25519 e a idade do timestamp
antes de interpretar o corpo. A resposta inicial é enviada imediatamente; o
trabalho restante é concluído com `waitUntil`.

O Worker do portal continua autoritativo para identidade, RBAC e fluxo
editorial. O token entre serviços não concede papéis: ele apenas permite ao
Worker de integração pedir uma operação em nome de um usuário Discord já
vinculado. O backend então aplica as permissões reais desse usuário.

## Persistência e confiabilidade

- `integration_inbox_events`: deduplicação e até três tentativas de uma
  interação recebida.
- `integration_deliveries`: estado e tentativas da publicação externa.
- `discord_post_targets`: fórum escolhido no comando para cada post.
- `discord_post_links`: associação única entre post, fórum e tópico.
- `audit_log`: registra `discord.post.published` com correlation ID.
- Queue `ordem-discord-publications`: entrega assíncrona pelo menos uma vez.
- Queue `ordem-discord-publications-dlq`: mensagens que esgotaram as tentativas.

`discord_post_targets` também preserva o nome e o avatar narrativos até a
publicação. Tokens de webhook não são armazenados: o Worker lista ou cria um
webhook pertencente à aplicação diretamente no fórum.

Desde o Marco 2.5, o Integration Worker usa `ordem-integration-db` e não possui
acesso físico ao D1 do portal. Identidade, RBAC, posts e auditoria são acessados
somente por contratos internos autenticados e idempotentes.

## Recursos Cloudflare

- Portal Worker: `ordem-da-ultima-luz`.
- Integration Worker: `ordem-discord-integration`.
- Service Binding no Integration: `PORTAL`.
- Producer binding no Portal: `DISCORD_PUBLICATIONS`.
- D1 binding no Integration: `INTEGRATION_DB`.

Antes do primeiro deploy, criar as filas:

```bash
npx wrangler queues create ordem-discord-publications
npx wrangler queues create ordem-discord-publications-dlq
```

Aplicar as migrations remotas somente no pipeline de implantação aprovado:

```bash
npm run db:migrate:remote
npm run db:migrate:integration:remote
```

## Configuração e segredos

O mesmo `INTEGRATION_SERVICE_TOKEN`, aleatório e com no mínimo 32 caracteres,
deve ser cadastrado nos dois Workers. Cada comando abaixo solicita o valor sem
versioná-lo:

```bash
npx wrangler secret put INTEGRATION_SERVICE_TOKEN
npx wrangler secret put INTEGRATION_SERVICE_TOKEN --config services/integration/wrangler.jsonc
npx wrangler secret put DISCORD_BOT_TOKEN --config services/integration/wrangler.jsonc
```

`DISCORD_PUBLIC_KEY` é pública e fica declarada em `wrangler.jsonc`.
`DISCORD_GUILD_ID` também é público e limita as interações ao servidor oficial.
`DISCORD_BOT_TOKEN` é o token secreto da aba Bot e não é o OAuth Client Secret.
Não existe um fórum fixo no ambiente: a opção obrigatória `forum` do `/post` usa
o seletor de canais do próprio Discord e aceita somente canais `GUILD_FORUM`.

## Deploy e Discord

Depois de testes, revisão e merge na `main`:

1. Aplicar as migrations do portal e da integração conforme o runbook do corte.
2. Publicar o portal para ativar o producer da Queue.
3. Publicar a integração com `npm run deploy:integration`.
4. No Discord Developer Portal, definir a Interactions Endpoint URL como
   `https://ordem-discord-integration.<subdominio>.workers.dev/interactions`.
5. Convidar o bot ao servidor com acesso ao canal e permissões para visualizar o
   canal, enviar mensagens, criar posts, enviar mensagens em posts e
   **Gerenciar webhooks**. Sem esta última permissão, a publicação continua pelo
   bot e mantém a autoria no corpo do texto.
6. Definir `DISCORD_BOT_TOKEN` em `.env.local` e executar
   `npm run discord:register`. O script carrega esse arquivo ignorado pelo Git e
   registra o comando diretamente na guild oficial.

O registro por guild aparece imediatamente e é indicado durante o
desenvolvimento. Sem `DISCORD_GUILD_ID`, o script registra o comando global.

## Validação ponta a ponta

1. Confirmar `GET /health` no Integration Worker.
2. Confirmar que o Discord aceita a Interactions Endpoint URL.
3. Entrar no portal com o mesmo usuário Discord e possuir `post:create` na
   campanha padrão.
4. Executar `/post`, selecionar um fórum, preencher o modal e receber uma prévia
   efêmera.
5. Confirmar `pending_review` no painel.
6. Aprovar e publicar manualmente no portal.
7. Confirmar um único tópico no fórum e sua associação no D1.
8. Reprocessar a mensagem de teste e confirmar que nenhum tópico duplicado é
   criado.
9. Conferir logs estruturados e a ação `discord.post.published` na auditoria.
10. Preencher nome/avatar em uma publicação de teste e confirmar que o cabeçalho
    do tópico usa a identidade narrativa.

A criação do banco, migração dos registros legados e rollback estão descritos
em [Marco 2.5 — Isolamento de persistência](./MARCO_2_5_STORAGE.md).

## Limites desta entrega

- Não usa Discord Gateway nem processo residente.
- Não publica conteúdo sem revisão humana.
- Não sincroniza personagens do Foundry; isso pertence ao Marco 3.
- Não executa resumos ou IA; isso pertence ao Marco 4.
- URLs de avatar são referências HTTPS; o sistema não hospeda nem transforma a
  imagem neste corte.
