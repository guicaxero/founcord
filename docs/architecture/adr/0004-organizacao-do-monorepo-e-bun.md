# ADR 0004 — Organização do monorepo, módulos de domínio e Bun

## Estado

Aceito em 21 de setembro de 2026. Complementa o
[ADR 0003](./0003-monorepo-e-entrega-protegida.md), que continua válido quanto à
entrega protegida. Os comandos `npm` citados nele foram substituídos pelos
equivalentes em Bun.

## Contexto

- **Stubs sem uso:** `services/identity` e `services/campaign` eram Workers
  Hono que só expunham `/health` e nunca foram implantados. A lógica real de
  Identity e Campaign sempre esteve no portal. Isso contradizia parte da
  documentação e confundia quem lia o repositório.
- **Raiz desorganizada:** a raiz misturava o app Next, três pastas `drizzle*`
  com três configurações, os schemas em `db/`, testes `.mjs` e 24 documentos
  sem categoria.
- **Instalação quebrada:** o `node_modules` guardava links para um caminho
  antigo do projeto.

## Decisão

1. **Unidades por pasta:**
   - `apps/portal` é o Portal Worker.
   - `workers/discord`, `workers/foundry-bridge` e `workers/automation` são os
     demais Workers.
   - `packages/contracts`, `packages/authz` e `packages/database` são
     bibliotecas compartilhadas.
   - Cada unidade implantável possui `package.json`, `tsconfig.json`,
     `wrangler.jsonc` e testes próprios.
2. **Identity e Campaign são módulos do portal:** ficam em
   `apps/portal/server/identity` e `apps/portal/server/campaign`, ao lado de
   `automation/`, `integrations/` e `shared/`. Os stubs foram removidos, e a
   extração para Workers segue os critérios do ADR 0003.
3. **Um único pacote de banco:** `packages/database` concentra schema e
   migrations dos três D1. Os `migrations_dir` dos Workers apontam para ele. Os
   nomes dos arquivos de migration foram preservados, de modo que a tabela
   `d1_migrations` de produção continua válida.
4. **Nomes dos pacotes:** os pacotes internos passam de `@vigilia/*` para
   `@ordem/*`. Os nomes dos Workers, D1, Queues e bindings na Cloudflare não
   mudam. O cookie `vigilia_session` também é mantido, para não encerrar sessões
   ativas.
5. **Bun:**
   - O Bun é o gerenciador de pacotes, com `bun.lock`, e o executor de scripts.
     Next, OpenNext e Wrangler continuam executando sobre o Node.js.
   - Os workspaces são listados explicitamente no `package.json` da raiz. No
     Windows com OneDrive, o glob `workers/*` não é resolvido pelo Bun.
6. **TypeScript em todo o código:**
   - Testes, scripts e configuração de lint são TypeScript. Os testes de
     integração migraram de `node:test` para Vitest, no projeto `integration`.
   - A única exceção é `postcss.config.mjs`, formato exigido pelo Next.

## Consequências

- Cada pasta tem um propósito único e documentado no README.
- Novos Workers entram em `workers/<nome>` e devem ser adicionados à lista de
  workspaces.
- O deploy continua na mesma ordem, agora pelos scripts `deploy:portal`,
  `deploy:discord`, `deploy:foundry` e `deploy:automation`.
