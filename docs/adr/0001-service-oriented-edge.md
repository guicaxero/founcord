# ADR 0001 — Serviços orientados a edge

## Estado

Aceito em 21 de agosto de 2026. A decisão de D1 físico único foi parcialmente
substituída pelo [ADR 0002](./0002-isolamento-do-banco-de-integracao.md).

## Decisão

Usar Next.js oficial com OpenNext para o portal e Hono para serviços TypeScript
executáveis em Cloudflare Workers. Os serviços serão mantidos no mesmo
workspace, mas terão entradas e contratos independentes.

Na primeira fase, um único D1 físico reduz a carga operacional. A separação de
bancos ocorrerá quando houver necessidade de escala, isolamento ou implantação
independente.

## Consequências

- O projeto permanece compatível com o nível gratuito.
- Não mantemos contêineres Node ou Python permanentemente ligados.
- Não são permitidas transações distribuídas.
- Eventos externos precisam de idempotência e retries.
- NestJS permanece uma opção futura para serviços que migrarem a contêineres,
  sem alterar os contratos OpenAPI.
