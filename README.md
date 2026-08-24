# Ordem da Última Luz

Portal comunitário para uma campanha West Marches de **Shadow of the Demon
Lord**, com quadro de missões, publicação editorial e integrações com Discord e
Foundry VTT.

## Fundamentos

- Next.js oficial, React e TailwindCSS no portal.
- OpenNext como adaptador de produção para Cloudflare Workers.
- TypeScript estrito em toda a base Node.
- Hono e OpenAPI nos serviços de domínio.
- Zod como validação dos contratos em runtime.
- D1/SQLite para estado estruturado e Drizzle para migrations.
- RBAC com escopo global ou por campanha; o backend é sempre autoritativo.
- Server Components para a primeira renderização e TanStack Query para estado remoto no navegador.

## Estrutura

```text
app/                    portal Next.js e BFF fino
db/                     schema D1 da primeira fase
packages/contracts/     contratos compartilhados e schemas Zod
packages/authz/         vocabulário de permissões e policies
services/identity/      autenticação, sessões e autorização
services/campaign/      missões, inscrições, posts e campanha
services/integration/   integração HTTP e Queue do Discord
services/foundry/       Bridge HTTPS, presença, sync e comandos Foundry
services/automation/    jobs editoriais, Queue, cota e Workers AI
docs/                   arquitetura, ADRs e matriz de acesso
```

O módulo cliente do Foundry possui ciclo de vida e releases independentes no
repositório público
[`guicaxero/founcord-module-foundryVTT`](https://github.com/guicaxero/founcord-module-foundryVTT).
Este monorepo mantém somente o portal, os serviços, os contratos e a
documentação da integração.

Os três serviços possuem entradas Hono independentes. Na primeira fase, o
portal e o banco são implantados juntos para caber no plano gratuito; os
limites de código e dados já permitem separar os Workers sem mudar os contratos.

## Desenvolvimento

Requer Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run typecheck
npm test
```

Para gerar uma migration após alterar `db/schema.ts`:

```bash
npm run db:generate
```

Consulte [a arquitetura](docs/ARCHITECTURE.md) e
[a matriz RBAC](docs/RBAC.md) antes de ampliar um domínio.

## Marco 1

- Discord OAuth 2 com PKCE e sessão opaca em cookie HTTP-only;
- RBAC global e por campanha aplicado no servidor;
- campanhas, membros e atribuição de papéis;
- missões com revisão, publicação, inscrições e lista de espera;
- posts com revisão humana e publicação no portal;
- trilha de auditoria e outbox;
- Next.js, TypeScript estrito, Tailwind CSS e TanStack Query;
- persistência Cloudflare D1 com migrations Drizzle.

## Configuração local

Copie `.env.example` para `.env.local`, preencha a aplicação Discord e cadastre
`http://localhost:3000/api/auth/discord/callback` como redirect URI. Para usar
os bindings D1 durante `next dev`, mantenha também uma `.dev.vars` baseada no
arquivo de exemplo. A produção usa o mesmo caminho sob o domínio publicado.

Para testar o runtime Cloudflare localmente, copie `.dev.vars.example` para
`.dev.vars`, aplique as migrations locais e execute `npm run preview`.

## Marco 1.5 — Cloudflare

O portal é publicado como um único Worker Next.js no plano gratuito, com D1
como banco. Os limites de Identity, Campaign e Integration continuam separados
por contratos e módulos; a divisão em Workers independentes só será feita
quando houver ganho operacional real.

Consulte [o runbook do Marco 1.5](docs/MARCO_1_5_CLOUDFLARE.md) para criação do
banco, secrets, migrations, OAuth, publicação e rollback.

## Marco 2 — Discord

O Discord recebe interações em um Worker HTTP separado. O comando `/post` abre
um modal, associa o autor à identidade Discord já vinculada no portal e cria um
post em `pending_review`. A aprovação e a publicação continuam exclusivamente
humanas no painel; depois da publicação no portal, uma Queue cria o tópico no
fórum do Discord de forma assíncrona e idempotente.

Consulte [o runbook do Marco 2](docs/MARCO_2_DISCORD.md) para arquitetura,
segredos, provisionamento, registro do comando e validação ponta a ponta.

## Marco 2.5 — Persistência isolada

Discord e Foundry usam um D1 próprio para inbox, entregas, jobs e referências
externas. O Integration Worker não recebe acesso ao banco do portal; identidade,
RBAC, conteúdo e auditoria permanecem sob responsabilidade exclusiva do Portal
Worker.

Consulte [o runbook do Marco 2.5](docs/MARCO_2_5_STORAGE.md) para ownership,
migração idempotente, ordem do corte e rollback.

## Marco 3 — Foundry VTT

O primeiro corte vertical do Marco 3 adiciona um Worker próprio para Foundry,
pareamento por código temporário, troca one-shot por credencial operacional,
heartbeat, estado online/offline, sincronização sanitizada de personagens e uma
fila de comandos com lease e idempotência. O módulo suporta exclusivamente o
sistema `demonlord` e inicia somente conexões HTTPS de saída.

Consulte [o runbook do Marco 3](docs/MARCO_3_FOUNDRY.md) para segurança,
contratos, migrations, instalação do módulo e validação.

## Marco 4 — Automações editoriais

O portal cria jobs autorizados em um Worker e D1 independentes. Workers AI
produz resumos, crônicas ou extrações a partir de texto fornecido; a saída é
validada e materializada exclusivamente como post `pending_review`. Queue,
leases, idempotência, cota diária e retenção de 30 dias protegem o fluxo e o
plano gratuito.

Consulte [o runbook do Marco 4](docs/MARCO_4_AUTOMATIONS.md) para segurança,
custos, recursos, secrets, migrations, deploy e rollback.
