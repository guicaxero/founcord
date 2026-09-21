# Ordem da Última Luz

Portal comunitário para uma campanha West Marches de **Shadow of the Demon
Lord**. O núcleo tem três pilares: o **portal web**, o **bot do Discord** e o
**Foundry VTT**. Tudo roda na Cloudflare, no plano gratuito e sem custos.

```text
Navegador ─► Portal Worker (Next.js + OpenNext) ─► D1 ordem-da-ultima-luz
Discord   ─► Discord Worker ──┐
Foundry   ─► Foundry Bridge ──┴─► D1 ordem-integration-db ─► Portal (Service Binding)
Portal    ─► Automation Worker ─► D1 ordem-automation-db ─► Workers AI ─► Portal
```

O módulo cliente do Foundry é mantido no repositório separado
[`guicaxero/founcord-module-foundryVTT`](https://github.com/guicaxero/founcord-module-foundryVTT).

## Estrutura do repositório

| Pasta | Propósito |
| --- | --- |
| `apps/portal/` | Portal Next.js e BFF. É o Worker `ordem-da-ultima-luz`, que hospeda os módulos Identity e Campaign. |
| `apps/portal/app/` | Rotas do App Router: páginas públicas, área do jogador, painel e `app/api/*`. |
| `apps/portal/components/` | Componentes React do portal (`admin/` para o painel de gestão). |
| `apps/portal/server/` | Regras de negócio do portal, organizadas por domínio (tabela abaixo). |
| `apps/portal/tests/` | Testes de integração do portal com Miniflare (HTML renderizado e API). |
| `workers/discord/` | Worker `ordem-discord-integration`: bot HTTP do Discord e consumidor da fila de publicações. |
| `workers/foundry-bridge/` | Worker `ordem-foundry-bridge`: pareamento, heartbeat, projeções e fila de comandos do Foundry. |
| `workers/automation/` | Worker `ordem-automation`: jobs editoriais com Workers AI, fila, cota e retenção. |
| `packages/contracts/` | `@ordem/contracts`: contratos Zod compartilhados por portal e Workers. |
| `packages/authz/` | `@ordem/authz`: papéis, permissões e policies RBAC. |
| `packages/database/` | `@ordem/database`: schema Drizzle e migrations de cada D1 (`portal/`, `integration/`, `automation/`). |
| `scripts/` | Scripts operacionais em TypeScript, executados com Bun. |
| `tests/` | Políticas do repositório (workflows, gerenciador de pacotes, limites). |
| `docs/` | Arquitetura, operação, produto e design. Veja o [índice](docs/README.md). |

Organização de `apps/portal/server/`:

| Pasta | Conteúdo |
| --- | --- |
| `identity/` | Discord OAuth com PKCE, cookies, sessões e capabilities. |
| `campaign/` | Campanhas, membros, missões, posts, sessões, diário, personagens, pedidos do Mercador e auditoria. |
| `automation/` | Cliente do Automation Worker e materialização de rascunhos. |
| `integrations/` | Clientes e callbacks do Discord e do Foundry Bridge e a autenticação entre serviços. |
| `shared/` | HTTP, D1, auditoria/outbox, datas e constantes. |

## Stack

- **Portal:** Next.js 16 (App Router), React 19, Tailwind CSS 4 e TanStack Query. É publicado com OpenNext.
- **Workers:** Hono em Cloudflare Workers.
- **Linguagem e validação:** TypeScript estrito em todo o código e Zod nos contratos.
- **Dados e filas:** D1 com migrations Drizzle, Queues e Workers AI.
- **Ferramentas:** Bun como gerenciador de pacotes e executor de scripts, e Vitest para testes. Next, OpenNext e Wrangler rodam sobre o Node.js.

## Desenvolvimento

Requer [Bun](https://bun.sh) `>=1.4` e Node.js `>=22.13`.

```bash
bun install
bun run dev
```

Na primeira execução, copie `apps/portal/.env.example` para `apps/portal/.env.local`
e `apps/portal/.dev.vars.example` para `apps/portal/.dev.vars`. Cadastre também
`http://localhost:3000/api/auth/discord/callback` como redirect URI na aplicação
Discord e rode `bun run db:migrate:portal:local`.

| Comando | O que faz |
| --- | --- |
| `bun run dev` | Portal em `http://localhost:3000`. |
| `bun run dev:discord` / `dev:foundry` / `dev:automation` | Worker local com `wrangler dev`. |
| `bun run preview` | Build OpenNext e execução do portal no runtime Workers. |
| `bun run typecheck` | `tsc` em todos os workspaces. |
| `bun run lint` | ESLint no monorepo. |
| `bun run test:unit` | Testes unitários (rápidos). |
| `bun run test` | Quality gate completo: typecheck, build, bundles e todos os testes. |
| `bun run ci` | Lint seguido do quality gate, igual ao GitHub Actions. |
| `bun run db:generate:<portal\|integration\|automation>` | Gera uma migration após alterar o schema correspondente. |
| `bun run db:migrate:<banco>:local` | Aplica migrations no D1 local. |
| `bun run discord:register` | Registra os comandos de guild do bot. |

## Entrega

Toda mudança chega à `main` por Pull Request, e o CI executa `bun run ci`. A
produção é publicada somente pelo workflow manual `Deploy production`, que
aplica as migrations, publica o portal e depois os Workers, e encerra com smoke
tests. Detalhes em [docs/operations/entrega.md](docs/operations/entrega.md).

## Onde continuar

- [Arquitetura](docs/architecture/arquitetura.md) e [matriz RBAC](docs/architecture/rbac.md)
- [Plano de implementação e estado atual](docs/product/plano-de-implementacao.md)
- [Padrão de UI/UX](docs/design/padrao-de-ui-ux.md), obrigatório para mudanças de interface
- [Runbooks de operação](docs/operations/runbooks/)
