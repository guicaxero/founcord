# Vigília do Último Farol

Portal comunitário para uma campanha West Marches de **Shadow of the Demon
Lord**, com quadro de missões, publicação editorial e integrações futuras com
Discord e Foundry VTT.

## Fundamentos

- Next.js/Vinext, React e TailwindCSS no portal.
- TypeScript estrito em toda a base Node.
- Hono e OpenAPI nos serviços de domínio.
- Zod como validação dos contratos em runtime.
- D1/SQLite para estado estruturado e Drizzle para migrations.
- RBAC com escopo global ou por campanha; o backend é sempre autoritativo.
- Server Components, Server Actions e cache nativo do Next; sem TanStack Query.

## Estrutura

```text
app/                    portal Next.js e BFF fino
db/                     schema D1 da primeira fase
packages/contracts/     contratos compartilhados e schemas Zod
packages/authz/         vocabulário de permissões e policies
services/identity/      autenticação, sessões e autorização
services/campaign/      missões, inscrições, posts e campanha
services/integration/   Discord, Foundry e automações
docs/                   arquitetura, ADRs e matriz de acesso
```

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
