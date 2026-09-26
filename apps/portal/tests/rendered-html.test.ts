import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, test } from "vitest";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const portalRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workerRoot = join(portalRoot, ".wrangler", "bundle");
const siteUrl = "https://ordem-da-ultima-luz.example.test";
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: [{ type: "ESModule", path: join(workerRoot, "worker.js") }],
  modulesRoot: workerRoot,
  compatibilityDate: "2026-08-21",
  compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
  d1Databases: ["DB"],
  bindings: { SITE_URL: siteUrl },
  serviceBindings: {
    ASSETS: async () => new Response("Not found", { status: 404 }),
  },
}));

afterAll(() => mf.dispose());

async function render(path = "/", init: { redirect?: "manual" | "follow" } = {}) {
  return mf.dispatchFetch(`http://localhost${path}`, {
    headers: { accept: "text/html" },
    ...init,
  });
}

test("renderiza a primeira superfície do portal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Ordem da Última Luz<\/title>/i);
  assert.match(html, /property="og:title"/i);
  assert.match(html, /property="og:description"/i);
  assert.match(html, /property="og:image"/i);
  assert.match(html, /name="twitter:title"/i);
  assert.match(html, /name="twitter:description"/i);
  assert.match(html, /name="twitter:image"/i);
  // Ícone da aba e da tela inicial do celular, gerados a partir do braseiro da Ordem.
  assert.match(html, /<link rel="icon" href="\/icon\.png/i);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-icon\.png/i);
  assert.match(
    html,
    /https:\/\/ordem-da-ultima-luz\.example\.test\/og\.png/i,
  );
  assert.match(html, /Enquanto houver luz/);
  assert.match(html, /Chamados da Ordem/);
  assert.match(html, /Diário de Sessões/);
  assert.match(html, /O Império está em crise/);
  assert.match(html, /Mercador/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("renderiza o Código oficial da Ordem", async () => {
  const response = await render("/ordem");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Código da Ordem/i);
  assert.match(html, /O mestre conduz a mesa/i);
  assert.match(html, /Novato.*Especialista/i);
  assert.match(html, /Cinco verdades do mundo/i);
});

test("renderiza a vitrine pública do Mercador", async () => {
  const response = await render("/mercador");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Mercador/i);
  assert.match(html, /enviar um pedido para o mestre/i);
  assert.match(html, /Estoque da campanha/i);
  assert.match(html, /Carregando|Consultando o catálogo/i);
});

test("renderiza a área autenticada do jogador sem expor uma ficha no HTML", async () => {
  const response = await render("/eu");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Minha área/i);
  assert.match(html, /Área do jogador/i);
  assert.match(html, /noindex/i);
  assert.doesNotMatch(html, /foundry_actor_id|owner_user_ids/i);
});

test("renderiza a entrada protegida do painel", async () => {
  const response = await render("/dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Painel da campanha|Acendendo as lanternas/i);
  assert.match(html, /noindex/i);
});

test("cada área do produto tem rota própria, inclusive páginas de detalhe", async () => {
  const routes = [
    ["/missoes", /Chamados da Ordem/],
    ["/missoes/11111111-1111-4111-8111-111111111111", /Voltar ao quadro|Consultando o chamado/],
    ["/cronicas", /Crônicas/],
    ["/cronicas/33333333-3333-4333-8333-333333333331", /Abrindo a crônica|Voltar ao arquivo/],
    ["/diario", /Diário de Sessões/],
    ["/diario/22222222-2222-4222-8222-222222222222", /Abrindo o registro|Voltar ao diário/],
  ] as const;
  for (const [path, content] of routes) {
    const response = await render(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), content, path);
  }
});

test("não publica a prévia visual de desenvolvimento", async () => {
  for (const path of ["/dev/ui-foundation", "/dev/player-character", "/dev/merchant-purchase"]) {
    const response = await render(path);
    assert.equal(response.status, 404);
  }
});

test("não mantém artefatos do starter na superfície final", async () => {
  const [page, layout, packageJson, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../../packages/database/portal/migrations/0003_official_campaign_content.sql", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /@tanstack\/react-query/);
  assert.match(migration, /Ordem da Última Luz/);
  assert.match(migration, /A Chama que Permaneceu/);
  assert.match(migration, /DELETE FROM `missions`/);
});

test("mantém a navegação essencial acessível nas superfícies públicas", async () => {
  const [homeResponse, orderResponse] = await Promise.all([
    render(),
    render("/ordem"),
  ]);
  const [home, order] = await Promise.all([
    homeResponse.text(),
    orderResponse.text(),
  ]);

  for (const html of [home, order]) {
    assert.match(html, /href="#main-content"[^>]*>Pular para o conteúdo/i);
    assert.match(html, /id="main-content"/i);
    assert.match(html, /aria-label="Navegação principal"/i);
    // As rotas do produto aparecem na navegação de toda superfície pública.
    for (const route of ["/missoes", "/cronicas", "/diario", "/mercador", "/ordem"]) {
      assert.match(html, new RegExp(`href="${route}"`, "i"));
    }
    assert.match(html, /aria-label="Abrir navegação"/i);
  }

  assert.match(order, /aria-label="Seções do Código"/i);
});

test("o painel de gestão tem uma rota por área, com navegação por teclado e RBAC", async () => {
  const [dashboard, areas, summaries, confirmDialog, navigation] = await Promise.all([
    readFile(new URL("../components/admin/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/admin/areas.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/admin/session-summaries-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/confirm-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/layout/navigation.ts", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /aria-label="Áreas de gestão"/);
  assert.match(dashboard, /aria-current=.*page/);
  assert.match(dashboard, /id="active-admin-area"/);
  assert.match(dashboard, /id="active-campaign"/);
  // O AppShell já entrega o <main id="main-content">; o painel não pode abrir outro.
  assert.doesNotMatch(dashboard, /<main\b/);
  assert.doesNotMatch(dashboard, /role="tab(list|panel)?"/);
  for (const label of ["Sessões", "Diário de Sessões", "Pedidos do Mercador", "Mundos do Foundry", "Configurações"]) {
    assert.match(areas, new RegExp(`label: "${label}"`));
  }
  for (const permission of ["foundry:world:manage", "session:manage", "merchant:purchase:manage"]) {
    assert.match(areas, new RegExp(permission));
  }
  // O menu "Gestão" deriva das mesmas permissões das áreas.
  assert.match(navigation, /areas\.flatMap/);
  assert.match(summaries, /label="Filtrar resumos por estado"/);
  assert.match(summaries, /aria-live="polite"/);
  assert.match(summaries, /confirmationText="EXCLUIR"/);
  assert.match(confirmDialog, /Digite <strong/);
});

test("cada área do painel responde na própria URL e endereços desconhecidos dão 404", async () => {
  for (const area of ["sessoes", "diario", "missoes", "pedidos", "configuracoes"]) {
    const response = await render(`/dashboard/${area}`);
    assert.equal(response.status, 200, area);
    assert.match(await response.text(), /noindex/i, area);
  }
  const unknown = await render("/dashboard/inexistente");
  assert.equal(unknown.status, 404);
});

test("o portal usa tema escuro e não conserva os termos inventados", async () => {
  const [home, merchant] = await Promise.all([
    render().then((response) => response.text()),
    render("/mercador").then((response) => response.text()),
  ]);
  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  for (const html of [home, merchant]) {
    assert.doesNotMatch(html, /West Marches/i);
    assert.doesNotMatch(html, /vigília|vigilia/i);
  }
  assert.match(globals, /color-scheme: dark/);
  // As folhas artesanais saíram na fase 3: todo o estilo vem dos tokens e utilidades.
  assert.doesNotMatch(globals, /styles\/|layer\(legacy\)|--ink-|--paper-/);
  assert.doesNotMatch(globals, /VIGILIA/);
});

test("a área do jogador continua fora dos buscadores e o endereço antigo redireciona", async () => {
  const playerArea = await render("/eu");
  assert.equal(playerArea.status, 200);
  assert.match(await playerArea.text(), /noindex/i);

  const legacy = await render("/personagem", { redirect: "manual" });
  assert.ok([307, 308].includes(legacy.status), `status inesperado: ${legacy.status}`);
  assert.match(legacy.headers.get("location") ?? "", new RegExp("/eu"));
});
