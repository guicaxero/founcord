# Marco 3 — Foundry VTT

## Escopo desta fundação

O primeiro corte vertical conecta um mundo de **Shadow of the Demon Lord** ao
portal sem expor a máquina do mestre à internet:

- Worker independente `ordem-foundry-bridge`;
- módulo Foundry compatível com as versões 13 e 14;
- sistema obrigatório `demonlord`;
- registro seguro e revogável de mundos;
- heartbeat e estado online/offline derivado;
- sincronização integral de uma projeção sanitizada dos personagens;
- fila de comandos idempotente com lease, retry e expiração.

Não fazem parte deste corte a tela administrativa de mundos, associação visual
entre usuário Discord e ator ou comandos de alteração de ficha. Esses fluxos
serão adicionados sobre os contratos já versionados.

## Topologia

```text
Módulo Foundry --HTTPS--> Foundry Bridge Worker --> Integration D1
                                  |
                                  +--Service Binding--> Portal Worker --> Portal D1
```

O Foundry sempre inicia a conexão. Não há WebSocket de entrada, port forwarding
ou acesso remoto ao computador do mestre.

## Ownership

### Integration D1

- `foundry_worlds`: metadados, hash da credencial e último heartbeat;
- `foundry_enrollment_tokens`: hashes de bootstrap já utilizados;
- `foundry_commands`: fila, leases, tentativas e resultados;
- `foundry_actor_links`: IDs externos e último sync observado;
- `integration_inbox_events`: deduplicação dos snapshots recebidos.

### Portal D1

- `foundry_character_projections`: projeção sanitizada usada pela campanha;
- `foundry_sync_cursors`: ordenação por mundo contra snapshots atrasados;
- `audit_log`: uma entrada `foundry.characters.synced` por `syncId`.

A ficha mecânica continua tendo o Foundry como fonte de verdade. O portal não
recebe descrições, notas do mestre, inventário, itens, imagens ou conteúdo de
livros.

## Segurança do registro

1. `FOUNDRY_ENROLLMENT_TOKEN` existe somente como secret do Bridge Worker.
2. O mestre o informa diretamente à API local do módulo; ele não é salvo.
3. O Bridge grava apenas o SHA-256 do bootstrap e aceita esse hash uma vez.
4. O Bridge devolve uma credencial operacional aleatória de 256 bits.
5. O servidor guarda apenas o hash dessa credencial.
6. Reconfigurar o secret Cloudflare permite registrar ou rotacionar outro mundo.
7. Um administrador pode revogar o mundo pela API interna.

Não envie os secrets em chat, issue, commit ou screenshot. Use `wrangler secret
put` diretamente no terminal.

## Presença

O módulo envia heartbeat a cada 30 segundos. O Worker considera o mundo:

- `online`: heartbeat recebido nos últimos 90 segundos;
- `offline`: sem heartbeat recente;
- `revoked`: credencial invalidada administrativamente.

Nenhum cliente pode gravar diretamente o texto `online` no banco.

## Comandos

Tipos permitidos na versão 1:

- `actor.sync.request`: solicita um snapshot integral;
- `chat.message.create`: cria uma mensagem de chat como texto escapado.

`macro.execute`, JavaScript arbitrário e alterações genéricas de documento são
rejeitados. Toda criação exige `Idempotency-Key`. O polling concede um lease de
30 segundos; um ack atrasado não pode concluir a entrega de outro consumidor.
Após seis leases expirados, o comando falha de forma persistida.

## Migrations locais

```bash
npm run db:migrate:integration:local
npm run db:migrate:local
```

As migrations de produção só devem ser aplicadas antes do primeiro deploy do
Bridge e depois de um backup/Time Travel confirmado:

```bash
npm run db:migrate:integration:remote
npm run db:migrate:remote
```

## Secrets e deploy

Cadastre secrets sem colocá-los em arquivos versionados:

```bash
npx wrangler secret put FOUNDRY_ENROLLMENT_TOKEN --config services/foundry/wrangler.jsonc
npx wrangler secret put INTEGRATION_SERVICE_TOKEN --config services/foundry/wrangler.jsonc
```

`INTEGRATION_SERVICE_TOKEN` deve ser o mesmo já usado pelo Portal Worker.
Publique o portal compatível antes do Bridge:

```bash
npm run deploy
npm run deploy:foundry
```

## Instalação do módulo

Em uma instalação de produção, abra **Add-on Modules → Install Module** e use o
manifesto público:

```text
https://github.com/guicaxero/founcord-module-foundryVTT/releases/latest/download/module.json
```

As releases são empacotadas no repositório público
`guicaxero/founcord-module-foundryVTT`; nenhum secret faz parte do artefato.
Durante o desenvolvimento, copie `foundry-module/ordem-foundry-bridge` para
`Data/modules/`. Depois de ativar o módulo no mundo, confira a URL e o ID da
campanha nas configurações. O primeiro acesso mostra apenas um aviso informativo
de que o mundo ainda não está conectado; isso não representa falha na ativação.
Como mestre, execute:

```js
await game.modules
  .get("ordem-foundry-bridge")
  .api.registerWorld("TOKEN_DE_BOOTSTRAP")
```

Depois do registro, rotacione `FOUNDRY_ENROLLMENT_TOKEN` antes de cadastrar
outro mundo. O módulo mantém somente o token operacional no armazenamento local
do navegador do mestre.

## Verificação

```bash
npm run typecheck
npm run lint
npm run bundle:foundry
npm run bundle:foundry:test
npm run test:unit
node --test tests/foundry-bridge.test.mjs
```

O teste ponta a ponta usa Miniflare e D1 reais: registra, envia heartbeat,
deduplica comando, executa lease/ack, sincroniza ator, deduplica o snapshot e
revoga o mundo.

## Rollback

1. Revogue os mundos ou remova o tráfego do Foundry Bridge Worker.
2. Desative o módulo no Foundry; isso não altera fichas.
3. Reverta o Portal e o Bridge para suas versões anteriores.
4. As tabelas novas podem permanecer vazias; não remova dados durante o rollback.
5. Se necessário, use D1 Time Travel para restaurar os dois bancos.
