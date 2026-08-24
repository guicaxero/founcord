# Marco 3 — Foundry VTT

## Escopo desta fundação

O primeiro corte vertical conecta um mundo de **Shadow of the Demon Lord** ao
portal sem expor a máquina do mestre à internet:

- Worker independente `ordem-foundry-bridge`;
- módulo Foundry compatível com as versões 13 e 14;
- sistema obrigatório `demonlord`;
- pareamento guiado, seguro e revogável de mundos;
- heartbeat e estado online/offline derivado;
- sincronização integral de uma projeção sanitizada dos personagens;
- fila de comandos idempotente com lease, retry e expiração.

Também fazem parte deste corte a autorização dedicada no portal e a tela de
gestão dos mundos da campanha. Associação visual entre usuário Discord e ator e
comandos de alteração de ficha continuam fora deste escopo.

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
- `foundry_pairing_sessions`: solicitações temporárias, código humano e estado
  da autorização;
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

## Segurança do pareamento

1. O módulo inicia uma solicitação com a identidade sanitizada do mundo, sem
   informar campanha ou papel.
2. O Bridge devolve um `deviceCode` aleatório de 256 bits e um código humano
   `LUME-XXXX-XXXX`, ambos válidos por dez minutos.
3. O banco guarda somente o SHA-256 dos códigos; o valor bruto não é recuperável.
4. No portal, a sessão Discord vê apenas campanhas em que possui
   `foundry:world:manage`.
5. `owner` pode autorizar qualquer campanha. `campaign_manager` e `gm` podem
   autorizar somente a própria campanha. Jogador e usuário comum recebem 403.
6. Depois da autorização, o Foundry troca o `deviceCode` uma única vez por uma
   credencial operacional aleatória diferente. Uma segunda troca é recusada e o
   código temporário nunca autentica heartbeat, sincronização ou comandos.
7. O servidor armazena somente o hash da credencial operacional. Ela é vinculada
   ao mundo e pode ser revogada no portal ou no Foundry.
8. A criação pública aplica limite por origem, limite global e remove sessões
   antigas automaticamente para conter abuso do armazenamento D1.

O ID da campanha nunca é aceito do cliente Foundry. A autorização é revalidada
no backend, independentemente dos controles visuais do portal.

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

Cadastre o secret de comunicação interna sem colocá-lo em arquivos versionados:

```bash
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
[`guicaxero/founcord-module-foundryVTT`](https://github.com/guicaxero/founcord-module-foundryVTT);
nenhum secret faz parte do artefato. Esse repositório público é a única fonte do
código, do manifesto e das releases do módulo. O monorepo `founcord` mantém o
Worker, os contratos e esta documentação, mas não contém uma cópia do cliente
Foundry.

Durante o desenvolvimento do módulo, trabalhe diretamente no repositório
público e instale-o em `Data/modules/ordem-foundry-bridge`. Depois de ativá-lo,
um mestre abre **Configurações → Configurar módulos → Ordem da Última Luz →
Gerenciar conexão**, gera o código e autoriza no portal. O módulo mantém somente
a credencial operacional no armazenamento local do navegador do mestre.

## Verificação

```bash
npm run typecheck
npm run lint
npm run bundle:foundry
npm run bundle:foundry:test
npm run test:unit
node --test tests/foundry-bridge.test.mjs
```

O teste ponta a ponta usa Miniflare e D1 reais: cria e autoriza o pareamento,
envia heartbeat, deduplica comando, executa lease/ack, sincroniza ator, deduplica
o snapshot e revoga o mundo.

## Rollback

1. Revogue os mundos ou remova o tráfego do Foundry Bridge Worker.
2. Desative o módulo no Foundry; isso não altera fichas.
3. Reverta o Portal e o Bridge para suas versões anteriores.
4. As tabelas novas podem permanecer vazias; não remova dados durante o rollback.
5. Se necessário, use D1 Time Travel para restaurar os dois bancos.
