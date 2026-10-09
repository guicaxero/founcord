# Marco 1.5 — Produção na Cloudflare

## Objetivo

Publicar a fundação do portal em infraestrutura própria da campanha, sem manter
servidores pagos e sem depender do adaptador provisório da hospedagem de
desenvolvimento.

## Runtime de produção

```text
Navegador
   |
Cloudflare Worker — Next.js + OpenNext
   |-- Route Handlers / BFF
   |-- Identity, Campaign e Audit
   |-- Assets estáticos
   |
Cloudflare D1
```

O primeiro deploy mantém os domínios no mesmo Worker e em um D1 físico. Essa é
uma unidade de implantação, não um monólito de código: contratos, políticas e
casos de uso continuam separados. Workers e bancos adicionais só devem surgir
quando isolamento, escala ou ciclos de release diferentes justificarem o custo
operacional.

## Recursos

- Worker: `ordem-da-ultima-luz`.
- URL: `https://ordem-da-ultima-luz.ordem-da-ultima-luz.workers.dev`.
- D1: `ordem-da-ultima-luz`, binding `DB`, id
  `88493218-9d07-4649-98d4-2df515c724e4`.
- Assets: `.open-next/assets`, binding `ASSETS`.
- Imagens: bucket R2 `ordem-portal-media`, binding `MEDIA`. Guarda capas e
  galerias de crônicas e missões, inclusive as copiadas do Discord; o portal
  serve cada imagem em `/media/<id>` com cache longo.
- Cache incremental R2: desativado no Marco 1.5.
- Segredos: cadastrados pelo Wrangler; nunca versionados.

## Preparação local

1. Copiar `.env.example` para `.env.local` para `next dev`.
2. Copiar `.dev.vars.example` para `.dev.vars` para a prévia Cloudflare.
3. Executar `bun run db:migrate:portal:local`.
4. Executar `bun run dev` para desenvolvimento rápido.
5. Executar `bun run preview` antes de uma publicação.

## Provisionamento inicial

1. Autenticar com `bunx wrangler login`.
2. Criar o D1 com `bunx wrangler d1 create ordem-da-ultima-luz`.
3. Registrar o `database_id` retornado em `wrangler.jsonc`.
4. Gerar os tipos com `bun run --cwd apps/portal cf-typegen`.
5. Aplicar as migrations com `bun run db:migrate:portal:remote`.
6. Criar o bucket de imagens com
   `bunx wrangler r2 bucket create ordem-portal-media` (uma vez; sem ele, o
   envio de imagens responde "O armazenamento de imagens ainda não está
   configurado").

As migrations criam a campanha padrão e o conteúdo oficial. O primeiro usuário
que concluir o OAuth na nova base recebe `owner` global; usuários seguintes
entram como jogadores e dependem de concessão explícita para administrar.

## Variáveis e segredos de produção

As variáveis públicas ficam declaradas em `wrangler.jsonc`:

```text
DISCORD_CLIENT_ID
DISCORD_REDIRECT_URI
SITE_URL
```

Os valores sensíveis são cadastrados exclusivamente no cofre de secrets do
Worker e nunca entram em arquivos ou commits:

```text
DISCORD_CLIENT_SECRET
SESSION_SECRET
```

Para cadastrar ou rotacionar o segredo do Discord:

```bash
bunx wrangler secret put DISCORD_CLIENT_SECRET
```

`DISCORD_REDIRECT_URI` deve ser a URL pública exata seguida de
`/api/auth/discord/callback`. `SITE_URL` deve conter apenas a origem pública,
sem barra final. O `SESSION_SECRET` deve ter ao menos 32 bytes aleatórios.

## Estado da implantação

- Worker publicado e respondendo em HTTPS.
- D1 remoto criado e com as quatro migrations aplicadas.
- `SESSION_SECRET`, URLs públicas e Client ID configurados.
- Smoke test aprovado em `/`, `/ordem`, `/dashboard`, `/api/me` e
  `/api/campaigns`.
- OAuth aguarda apenas o recadastro do `DISCORD_CLIENT_SECRET` e a inclusão do
  novo callback no Discord Developer Portal.

## Publicação

1. Executar `bun run test`.
2. Executar `bun run deploy:portal`.
3. Confirmar respostas `200` em `/`, `/ordem`, `/dashboard`, `/api/me` e
   `/api/campaigns`.
4. Atualizar o redirect URI no Discord Developer Portal.
5. Validar login, sessão, papel `owner`, painel e logout.
6. Validar navegação entre `/dashboard` e `/` sem document reload.

## Segurança e rollback

- O frontend não decide autorização; toda policy continua no Worker.
- Segredos não entram no build, Git, logs ou D1.
- Migrations são aplicadas antes do tráfego depender do novo schema.
- A hospedagem provisória deve permanecer intacta até OAuth, RBAC e navegação
  serem validados na URL Cloudflare.
- Em falha, o tráfego continua na URL anterior enquanto o Worker é corrigido;
  não reverta migrations destrutivamente.
