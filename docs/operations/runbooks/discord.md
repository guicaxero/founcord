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
bunx wrangler queues create ordem-discord-publications
bunx wrangler queues create ordem-discord-publications-dlq
```

Aplicar as migrations remotas somente no pipeline de implantação aprovado:

```bash
bun run db:migrate:portal:remote
bun run db:migrate:integration:remote
```

## Configuração e segredos

O mesmo `INTEGRATION_SERVICE_TOKEN`, aleatório e com no mínimo 32 caracteres,
deve ser cadastrado nos dois Workers. Cada comando abaixo solicita o valor sem
versioná-lo:

```bash
bunx wrangler secret put INTEGRATION_SERVICE_TOKEN
bunx wrangler secret put INTEGRATION_SERVICE_TOKEN --config workers/discord/wrangler.jsonc
bunx wrangler secret put DISCORD_BOT_TOKEN --config workers/discord/wrangler.jsonc
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
3. Publicar a integração com `bun run deploy:discord`.
4. No Discord Developer Portal, definir a Interactions Endpoint URL como
   `https://ordem-discord-integration.<subdominio>.workers.dev/interactions`.
5. Convidar o bot ao servidor com acesso ao canal e permissões para visualizar o
   canal, enviar mensagens, criar posts, enviar mensagens em posts e
   **Gerenciar webhooks**. Sem esta última permissão, a publicação continua pelo
   bot e mantém a autoria no corpo do texto.
6. Os comandos da guild se registram sozinhos: de hora em hora (minuto 23), o
   Worker compara os comandos registrados com `src/commands.ts` e só reenvia a
   lista quando houver diferença. Depois de um deploy que muda comandos, o
   Discord mostra a versão nova em até uma hora. Para registrar na hora, use
   `POST /internal/discord/register-commands` com o token entre serviços ou
   defina `DISCORD_BOT_TOKEN` em `.env.local` e execute
   `bun run discord:register`.

O registro por guild aparece imediatamente e é indicado durante o
desenvolvimento. Sem `DISCORD_GUILD_ID`, o script registra o comando global.

## Registro do Corvo

As atividades da Vida na Sede são publicadas no tópico de cada Corvo no fórum
Registro do Corvo (`REGISTRO_DO_CORVO_CHANNEL_ID` em `workers/discord/wrangler.jsonc`).
O bot precisa, nesse fórum, de **Ver canal**, **Ler histórico de mensagens** e
**Enviar mensagens em tópicos**. O tópico de cada Corvo é ligado no painel de
Personagens. O portal consulta a lista de tópicos em
`GET /internal/discord/registro/threads`, com o token entre serviços.

## Importar crônicas dos fóruns

Em Crônicas, "Importar do Discord" lista os fóruns do servidor
(`GET /internal/discord/forums`), os tópicos de um fórum
(`GET /internal/discord/forums/:id/threads`, ativos e até 500 arquivados) e lê a
mensagem inicial de cada tópico (`GET /internal/discord/threads/:id/starter`).
O portal copia as imagens dos anexos para o bucket de imagens e cria a crônica
com origem Discord; ela não é republicada no Discord ao ser publicada.

Para isso, uma vez:

1. No Discord Developer Portal, em **Bot**, ligar **Message Content Intent**
   (bots em menos de 100 servidores não precisam de verificação). Sem ele, o
   Discord devolve as mensagens vazias e o portal avisa no resultado.
2. Dar ao bot **Ver canal** e **Ler histórico de mensagens** nos fóruns
   códice-dos-corvos, registros-dos-corvos e registros-das-missões.

Só a mensagem inicial é importada; as respostas ficam no Discord.

## Importar registros de missão

Em Missões, "Importar do Discord" (exige `mission:publish`) usa as mesmas
leituras, com registros-das-missões escolhido. Cada tópico marcado vira uma
missão publicada direto no Registro de missões, com a situação escolhida no
diálogo: o título dá o número e o nome ("Missão Nº 001 - …"), a linha
"Local:" dá a região, a mensagem inicial é o chamado e a primeira imagem é a
capa. Tópicos já ligados a uma missão (importados ou publicados pelo portal)
aparecem como "Já no registro". Número repetido entra sem número, com aviso.
Valem as mesmas permissões e o Message Content Intent da seção anterior.

## Publicar missões no fórum

Em Missões, uma missão publicada no portal ganha "Publicar no Discord". O
painel lista os fóruns (registros-das-missões vem escolhido) e as tags do fórum
(`GET /internal/discord/forums/:id`), e o portal envia o texto, as tags e a
capa para `POST /internal/discord/missions/publish`. A capa vai como anexo,
para aparecer como imagem do tópico na galeria do fórum. Cada missão é
publicada uma vez só; o tópico fica ligado à missão.

No fórum registros-das-missões, o bot precisa de **Ver canal**, **Criar
postagens**, **Enviar mensagens em tópicos** e **Anexar arquivos**; para
publicar com nome e avatar narrativos, também **Gerenciar webhooks**.

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
- Não publica conteúdo sem revisão humana, exceto na importação de crônicas
  quando quem tem `post:publish` escolhe "Já publicadas".
- Não sincroniza personagens do Foundry; isso pertence ao Marco 3.
- Não executa resumos ou IA; isso pertence ao Marco 4.
- URLs de avatar são referências HTTPS; o sistema não hospeda nem transforma a
  imagem neste corte.
