import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
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
    /https:\/\/ordem-da-ultima-luz\.caxeropl\.chatgpt\.site\/og\.png/i,
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
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("dashboard-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/dashboard", {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Painel da campanha|Acendendo as lanternas/i);
  assert.match(html, /noindex/i);
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
