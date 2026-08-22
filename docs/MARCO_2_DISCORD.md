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

O Marco 2 ainda compartilha o D1 físico com o portal para manter custo e operação
baixos. As tabelas de integração não são acessadas pelo navegador e podem migrar
para um `integration-db` sem alterar os contratos públicos.

## Recursos Cloudflare

- Portal Worker: `ordem-da-ultima-luz`.
- Integration Worker: `ordem-discord-integration`.
- Service Binding no Integration: `PORTAL`.
- Producer binding no Portal: `DISCORD_PUBLICATIONS`.
- D1 binding no Integration: `DB`.

Antes do primeiro deploy, criar as filas:

```bash
npx wrangler queues create ordem-discord-publications
npx wrangler queues create ordem-discord-publications-dlq
```

Aplicar a migration remota somente no pipeline de implantação aprovado:

```bash
npm run db:migrate:remote
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

1. Aplicar a migration remota.
2. Publicar o portal para ativar o producer da Queue.
3. Publicar a integração com `npm run deploy:integration`.
4. No Discord Developer Portal, definir a Interactions Endpoint URL como
   `https://ordem-discord-integration.<subdominio>.workers.dev/interactions`.
5. Convidar o bot ao servidor com acesso ao canal e permissões para visualizar o
   canal, enviar mensagens, criar posts e enviar mensagens em posts.
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

## Limites desta entrega

- Não usa Discord Gateway nem processo residente.
- Não publica conteúdo sem revisão humana.
- Não sincroniza personagens do Foundry; isso pertence ao Marco 3.
- Não executa resumos ou IA; isso pertence ao Marco 4.
