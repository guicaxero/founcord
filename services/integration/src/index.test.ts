import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscordPostPublication, Post } from "@vigilia/contracts";
import { handlePublicationBatch, integrationApp } from "./index";
import type { IntegrationEnv, PublicationBatch } from "./types";

const applicationId = "1540460545558323250";
const campaignId = "11111111-1111-4111-8111-111111111111";

describe("Discord integration Worker", () => {
  let keys: CryptoKeyPair;
  let publicKeyHex: string;
  let db: FakeDatabase;
  let env: IntegrationEnv;
  let portalFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    keys = (await crypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    publicKeyHex = toHex(await crypto.subtle.exportKey("raw", keys.publicKey));
    db = new FakeDatabase();
    portalFetch = vi.fn(async (request: Request) => {
      const published = request.method === "GET";
      return Response.json({ post: postFixture(published ? "published" : "pending_review") }, {
        status: published ? 200 : 201,
      });
    });
    env = {
      DB: db as unknown as D1Database,
      PORTAL: { fetch: portalFetch } as unknown as Fetcher,
      DISCORD_PUBLIC_KEY: publicKeyHex,
      DISCORD_APPLICATION_ID: applicationId,
      DISCORD_BOT_TOKEN: "bot-token",
      DISCORD_GUILD_ID: "123456789012345678",
      DISCORD_FORUM_CHANNEL_ID: "223456789012345678",
      INTEGRATION_SERVICE_TOKEN: "i".repeat(64),
      DEFAULT_CAMPAIGN_ID: campaignId,
      SITE_URL: "https://ordem.example",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recusa uma interação sem assinatura válida", async () => {
    const response = await integrationApp.fetch(
      new Request("https://integration.example/interactions", {
        method: "POST",
        body: JSON.stringify({ id: "123456", application_id: applicationId, type: 1, token: "x" }),
      }),
      env,
      executionContext(),
    );
    expect(response.status).toBe(401);
  });

  it("responde ao PING assinado do Discord", async () => {
    const response = await integrationApp.fetch(
      await signedRequest(
        { id: "123456", application_id: applicationId, type: 1, token: "ping" },
        keys.privateKey,
      ),
      env,
      executionContext(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });

  it("abre o modal do comando /post", async () => {
    const response = await integrationApp.fetch(
      await signedRequest(
        {
          id: "223456",
          application_id: applicationId,
          type: 2,
          token: "command",
          guild_id: "123456789012345678",
          data: { name: "post" },
        },
        keys.privateKey,
      ),
      env,
      executionContext(),
    );
    const body = (await response.json()) as { type: number; data: { custom_id: string } };
    expect(body.type).toBe(9);
    expect(body.data.custom_id).toBe("post:create:v1");
  });

  it("cria um rascunho idempotente e devolve a prévia efêmera", async () => {
    const waits: Promise<unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 200 })),
    );
    const payload = {
      id: "323456",
      application_id: applicationId,
      type: 5,
      token: "modal-token",
      guild_id: "123456789012345678",
      channel_id: "223456789012345678",
      member: { user: { id: "423456789012345678", username: "guardiao" } },
      data: {
        custom_id: "post:create:v1",
        components: [
          { type: 1, components: [{ type: 4, custom_id: "post_persona", value: "Aster" }] },
          { type: 1, components: [{ type: 4, custom_id: "post_title", value: "Sinais no ermo" }] },
          { type: 1, components: [{ type: 4, custom_id: "post_body", value: "A chama foi vista ao norte." }] },
        ],
      },
    };
    const response = await integrationApp.fetch(
      await signedRequest(payload, keys.privateKey),
      env,
      executionContext(waits),
    );
    expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } });
    await Promise.all(waits);

    const duplicateWaits: Promise<unknown>[] = [];
    await integrationApp.fetch(
      await signedRequest(payload, keys.privateKey),
      env,
      executionContext(duplicateWaits),
    );
    await Promise.all(duplicateWaits);

    expect(portalFetch).toHaveBeenCalledTimes(1);
    expect(db.inbox.get("323456")?.status).toBe("succeeded");
  });

  it("publica uma única thread e registra a associação", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/channels/")) {
          return Response.json({ id: "523456789012345678", message: { id: "623456789012345678" } });
        }
        return Response.json({});
      }),
    );
    const ack = vi.fn();
    const retry = vi.fn();
    const body: DiscordPostPublication = {
      type: "discord.post.publish",
      version: 1,
      postId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      campaignId,
      correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const batch = {
      messages: [{ body, ack, retry }],
    } as unknown as PublicationBatch;

    await handlePublicationBatch(batch, env);
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(db.links.has(body.postId)).toBe(true);
    expect(db.auditActions).toContain("discord.post.published");
  });
});

function executionContext(waits: Promise<unknown>[] = []): ExecutionContext {
  return {
    waitUntil(promise) {
      waits.push(promise);
    },
    passThroughOnException() {},
    props: {},
  } as ExecutionContext;
}

async function signedRequest(payload: unknown, privateKey: CryptoKey): Promise<Request> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    new TextEncoder().encode(timestamp + body),
  );
  return new Request("https://integration.example/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": toHex(signature),
      "x-signature-timestamp": timestamp,
    },
    body,
  });
}

function postFixture(status: Post["status"]): Post {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    campaignId,
    authorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    authorName: "Guardião",
    title: "Sinais no ermo",
    body: "A chama foi vista ao norte.",
    status,
    source: "discord",
    reviewedBy: status === "published" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null,
    publishedAt: status === "published" ? "2026-08-21T20:00:00.000Z" : null,
    version: 2,
    createdAt: "2026-08-21T19:00:00.000Z",
    updatedAt: "2026-08-21T20:00:00.000Z",
  };
}

function toHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class FakeDatabase {
  readonly inbox = new Map<string, { status: "processing" | "succeeded" | "failed"; result: string | null; attempts: number }>();
  readonly deliveries = new Map<string, { status: "pending" | "succeeded" | "failed"; externalId: string | null }>();
  readonly links = new Set<string>();
  readonly auditActions: string[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

class FakeStatement {
  private args: unknown[] = [];

  constructor(
    private readonly db: FakeDatabase,
    private readonly sql: string,
  ) {}

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("FROM integration_inbox_events")) {
      const row = this.db.inbox.get(String(this.args[0]));
      return (row
        ? { status: row.status, result_entity_id: row.result, attempts: row.attempts }
        : null) as T | null;
    }
    if (this.sql.includes("FROM discord_post_links")) {
      return (this.db.links.has(String(this.args[0])) ? { linked: 1 } : null) as T | null;
    }
    if (this.sql.includes("FROM integration_deliveries")) {
      const row = this.db.deliveries.get(String(this.args[0]));
      return (row
        ? { status: row.status, external_id: row.externalId }
        : null) as T | null;
    }
    return null;
  }

  async run() {
    let changes = 1;
    if (this.sql.includes("INSERT OR IGNORE INTO integration_inbox_events")) {
      const interactionId = String(this.args[1]);
      if (!this.db.inbox.has(interactionId)) {
        this.db.inbox.set(interactionId, { status: "processing", result: null, attempts: 0 });
      }
    } else if (this.sql.includes("UPDATE integration_inbox_events")) {
      const interactionId = String(this.args.at(-1));
      const row = this.db.inbox.get(interactionId);
      if (row && this.sql.includes("status = 'processing'")) {
        if ((row.status === "failed" || (row.status === "processing" && row.attempts === 0)) && row.attempts < 3) {
          row.status = "processing";
          row.attempts += 1;
        } else {
          changes = 0;
        }
      } else if (row && this.sql.includes("status = 'succeeded'")) {
        row.status = "succeeded";
        row.result = String(this.args[0]);
      } else if (row) {
        row.status = "failed";
      }
    } else if (this.sql.includes("INSERT OR IGNORE INTO integration_deliveries")) {
      const key = String(this.args[1]);
      if (!this.db.deliveries.has(key)) {
        this.db.deliveries.set(key, { status: "pending", externalId: null });
      }
    } else if (this.sql.includes("UPDATE integration_deliveries")) {
      const key = String(this.args.at(-1));
      const row = this.db.deliveries.get(key);
      if (row && this.sql.includes("status = 'succeeded'")) {
        row.status = "succeeded";
        row.externalId = String(this.args[0]);
      } else if (row && this.sql.includes("status = 'failed'")) {
        row.status = "failed";
      } else if (row) {
        row.status = "pending";
      }
    } else if (this.sql.includes("INSERT OR IGNORE INTO discord_post_links")) {
      this.db.links.add(String(this.args[1]));
    } else if (this.sql.includes("INSERT INTO audit_log")) {
      this.db.auditActions.push("discord.post.published");
    }
    return { success: true, meta: { changes } };
  }
}
