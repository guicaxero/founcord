import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workerRoot = join(root, ".wrangler", "test-bundle");
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

test.after(() => mf.dispose());

async function render(path = "/") {
  return mf.dispatchFetch(`http://localhost${path}`, {
    headers: { accept: "text/html" },
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
  assert.match(
    html,
    /https:\/\/ordem-da-ultima-luz\.example\.test\/og\.png/i,
  );
  assert.match(html, /Enquanto houver luz/);
  assert.match(html, /Chamados da Ordem/);
  assert.match(html, /O Império está em crise/);
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

test("renderiza a entrada protegida do painel", async () => {
  const response = await render("/dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Painel da campanha|Acendendo as lanternas/i);
  assert.match(html, /noindex/i);
});

test("não publica a prévia visual de desenvolvimento", async () => {
  const response = await render("/dev/ui-foundation");
  assert.equal(response.status, 404);
});

test("não mantém artefatos do starter na superfície final", async () => {
  const [page, layout, packageJson, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_official_campaign_content.sql", import.meta.url), "utf8"),
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
    assert.match(html, /class="skip-link"[^>]*href="#main-content"/i);
    assert.match(html, /id="main-content"/i);
    assert.match(html, /responsive-navigation-wide/i);
    assert.match(html, /responsive-navigation-compact/i);
    assert.match(html, /<summary>/i);
  }

  assert.match(home, /Explorar portal/i);
  assert.match(order, /Neste documento/i);
});

test("o shell de gestão usa navegação compatível com teclado e RBAC", async () => {
  const [dashboard, accountMenu, responsiveCss] = await Promise.all([
    readFile(new URL("../components/admin/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/account-menu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/styles/responsive.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /<nav className="admin-navigation"/);
  assert.match(dashboard, /aria-current=.*page/);
  assert.match(dashboard, /className="admin-mobile-navigation"/);
  assert.match(dashboard, /id="active-admin-area"/);
  assert.doesNotMatch(dashboard, /role="tab(list|panel)?"/);
  assert.match(responsiveCss, /\.admin-navigation\s*{\s*display:\s*none/s);
  assert.match(responsiveCss, /\.admin-mobile-navigation\s*{\s*display:\s*grid/s);
  assert.match(accountMenu, /foundry:world:manage/);
  assert.match(accountMenu, /session:manage/);
});
