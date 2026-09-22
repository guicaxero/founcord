import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

// Respostas JSON dinâmicas: as asserções validam a forma em tempo de execução.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type TestDatabase = Awaited<ReturnType<Miniflare["getD1Database"]>>;
type ApiOptions = Readonly<{
  token?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}>;

const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsRoot = join(workerRoot, "..", "..", "packages", "database", "automation", "migrations");
const origin = "http://localhost:8790";
const campaignId = "11111111-1111-4111-8111-111111111111";
const otherCampaignId = "99999999-9999-4999-8999-999999999999";
const requesterId = "33333333-3333-4333-8333-333333333333";
const serviceToken = "test-automation-token-with-at-least-32-bytes";

test("Marco 4: jobs isolados, idempotência, cota e cancelamento", async () => {
  const serverRoot = join(workerRoot, ".wrangler", "bundle");
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: [{ type: "ESModule", path: join(serverRoot, "index.js") }],
      modulesRoot: serverRoot,
      compatibilityDate: "2026-08-21",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: ["AUTOMATION_DB"],
      queueProducers: { AUTOMATION_JOBS: "ordem-automation-jobs" },
      bindings: {
        AUTOMATION_SERVICE_TOKEN: serviceToken,
        AUTOMATION_DAILY_JOB_LIMIT: "2",
      },
      serviceBindings: {
        PORTAL: async () => Response.json({ error: "not_expected" }, { status: 500 }),
      },
    }),
  );

  try {
    const db = await mf.getD1Database("AUTOMATION_DB");
    await applyMigrations(db);

    const health = await mf.dispatchFetch(`${origin}/health`);
    assert.equal(health.status, 200);

    const unauthorized = await api(
      mf,
      `/internal/automations/campaigns/${campaignId}/jobs`,
    );
    assert.equal(unauthorized.status, 401);

    const invalid = await api(
      mf,
      `/internal/automations/campaigns/${campaignId}/jobs`,
      {
        method: "POST",
        token: serviceToken,
        headers: { "idempotency-key": "test:invalid" },
        body: { campaignId },
      },
    );
    assert.equal(invalid.status, 422);

    const firstInput = jobInput("session_summary", "Primeiro registro");
    const first = await api(
      mf,
      `/internal/automations/campaigns/${campaignId}/jobs`,
      {
        method: "POST",
        token: serviceToken,
        headers: { "idempotency-key": "test:automation:first" },
        body: firstInput,
      },
    );
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(first.data.job.status, "queued");
    assert.equal(first.data.quota.usedToday, 1);

    const duplicate = await api(
      mf,
      `/internal/automations/campaigns/${campaignId}/jobs`,
      {
        method: "POST",
        token: serviceToken,
        headers: { "idempotency-key": "test:automation:first" },
        body: firstInput,
      },
    );
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.job.id, first.data.job.id);
    assert.equal(duplicate.data.quota.usedToday, 1);

    const second = await api(
      mf,
      `/internal/automations/campaigns/${campaignId}/jobs`,
      {
        method: "POST",
        token: serviceToken,
        headers: { "idempotency-key": "test:automation:second" },
        body: jobInput("record_extraction", "Segundo registro"),
      },
    );
    assert.equal(second.status, 201, JSON.stringify(second.data));
    assert.equal(second.data.quota.remainingToday, 0);

    const limited = await api(
      mf,
      `/internal/automations/campaigns/${campaignId}/jobs`,
      {
        method: "POST",
        token: serviceToken,
        headers: { "idempotency-key": "test:automation:third" },
        body: jobInput("chronicle_draft", "Terceiro registro"),
      },
    );
    assert.equal(limited.status, 429);
    assert.equal(limited.data.error, "automation_daily_limit_reached");

    const list = await api(
      mf,
      `/internal/automations/campaigns/${campaignId}/jobs`,
      { token: serviceToken },
    );
    assert.equal(list.status, 200);
    assert.equal(list.data.data.length, 2);

    const isolated = await api(
      mf,
      `/internal/automations/campaigns/${otherCampaignId}/jobs`,
      { token: serviceToken },
    );
    assert.deepEqual(isolated.data.data, []);

    const cancelled = await api(
      mf,
      `/internal/automations/campaigns/${campaignId}/jobs/${first.data.job.id}`,
      { method: "DELETE", token: serviceToken },
    );
    assert.equal(cancelled.status, 204);
    const row = await db
      .prepare("SELECT status, source_content FROM automation_jobs WHERE id = ?")
      .bind(first.data.job.id)
      .first();
    assert.deepEqual(row, { status: "cancelled", source_content: "" });
  } finally {
    await mf.dispose();
  }
});

async function applyMigrations(db: TestDatabase) {
  const directory = migrationsRoot;
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(join(directory, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await db.prepare(query).run();
    }
  }
}

async function api(
  mf: Miniflare,
  path: string,
  options: ApiOptions = {},
): Promise<{ status: number; data: Json }> {
  const headers = new Headers(options.headers);
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const response = await mf.dispatchFetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return {
    status: response.status,
    data: (response.status === 204 ? null : await response.json()) as Json,
  };
}

function jobInput(kind: string, label: string) {
  return {
    campaignId,
    kind,
    source: {
      kind: "pasted_text",
      label,
      content:
        "A patrulha deixou o Farol ao amanhecer, alcançou o moinho e decidiu manter vigília. " +
        "Encontrou marcas recentes junto à estrada e retornou antes da meia-noite com o registro preservado.",
    },
    requestedByUserId: requesterId,
    requestedByName: "Mestre da Vigília",
    correlationId: "55555555-5555-4555-8555-555555555555",
  };
}
