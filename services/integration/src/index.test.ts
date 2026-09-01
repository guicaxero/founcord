import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscordPostPublication, Post } from "@vigilia/contracts";
import { handlePublicationBatch, integrationApp } from "./index";
import { postTargetFromModal } from "./discord-components";
import type { IntegrationEnv, PublicationBatch } from "./types";

const applicationId = "1540460545558323250";
const campaignId = "11111111-1111-4111-8111-111111111111";
const guildId = "123456789012345678";
const forumChannelId = "223456789012345678";
const forumTagId = "233456789012345678";
const discordUserId = "423456789012345678";

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
      if (request.url.endsWith("/api/internal/integration/discord/publications")) {
        return Response.json({ ok: true });
      }
      const published = request.method === "GET";
      return Response.json({ post: postFixture(published ? "published" : "pending_review") }, {
        status: published ? 200 : 201,
      });
    });
    env = {
      INTEGRATION_DB: db as unknown as D1Database,
      PORTAL: { fetch: portalFetch } as unknown as Fetcher,
      DISCORD_PUBLIC_KEY: publicKeyHex,
      DISCORD_APPLICATION_ID: applicationId,
      DISCORD_BOT_TOKEN: "bot-token",
      DISCORD_GUILD_ID: guildId,
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

  it("protege o registro de comandos com o segredo interno", async () => {
    const response = await integrationApp.fetch(
      new Request("https://integration.example/internal/discord/register-commands", {
        method: "POST",
      }),
      env,
      executionContext(),
    );

    expect(response.status).toBe(401);
  });

  it("registra /post e /mercador no servidor sem expor o Bot Token", async () => {
    const discordFetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return Response.json([{ id: "323456789012345678", name: "post" }]);
      },
    );
    vi.stubGlobal("fetch", discordFetch);
    const response = await integrationApp.fetch(
      new Request("https://integration.example/internal/discord/register-commands", {
        method: "POST",
        headers: { authorization: `Bearer ${env.INTEGRATION_SERVICE_TOKEN}` },
      }),
      env,
      executionContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      scope: "guild",
      guildId,
      commands: [{ id: "323456789012345678", name: "post" }],
    });
    expect(discordFetch).toHaveBeenCalledWith(
      `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ authorization: "Bot bot-token" }),
      }),
    );
    const request = discordFetch.mock.calls[0]?.[1] as RequestInit;
    const commands = JSON.parse(String(request.body)) as Array<{
      name: string;
      options: Array<{
        name: string;
        channel_types?: number[];
        autocomplete?: boolean;
      }>;
    }>;
    expect(commands[0]?.name).toBe("post");
    expect(commands[0]?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "forum", channel_types: [15] }),
        expect.objectContaining({ name: "tag", autocomplete: true }),
      ]),
    );
    expect(commands[1]).toMatchObject({ name: "mercador" });
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => forumChannelResponse()),
    );
    const response = await integrationApp.fetch(
      await signedRequest(
        {
          id: "223456",
          application_id: applicationId,
          type: 2,
          token: "command",
          guild_id: guildId,
          data: {
            name: "post",
            options: [
              { name: "forum", type: 7, value: forumChannelId },
              { name: "tag", type: 3, value: forumTagId },
            ],
            resolved: {
              channels: {
                [forumChannelId]: {
                  id: forumChannelId,
                  name: "relatos-do-ermo",
                  type: 15,
                },
              },
            },
          },
        },
        keys.privateKey,
      ),
      env,
      executionContext(),
    );
    const body = (await response.json()) as { type: number; data: { custom_id: string } };
    expect(body.type).toBe(9);
    expect(body.data.custom_id).toBe(
      `post:create:v3:${forumChannelId}:${forumTagId}`,
    );
    expect(JSON.stringify(body)).toContain("post_avatar_url");
  });

  it("consulta o Mercador com filtro de disponibilidade e link para o portal", async () => {
    db.merchantCatalog = {
      campaign_id: campaignId,
      last_seen_at: new Date().toISOString(),
      connection_status: "online",
      merchant_name: "Intendente da Ordem",
      captured_at: new Date().toISOString(),
      items_json: JSON.stringify([
        {
          itemId: "torch-001",
          name: "Tocha",
          description: "Uma fonte simples de luz.",
          category: "Equipamento",
          imageUrl: null,
          price: "1 cp",
          quantity: 5,
          sourceUpdatedAt: "2026-08-31T12:00:00.000Z",
        },
        {
          itemId: "oil-001",
          name: "Óleo",
          description: null,
          category: "Equipamento",
          imageUrl: null,
          price: null,
          quantity: 0,
          sourceUpdatedAt: "2026-08-31T12:00:00.000Z",
        },
      ]),
    };
    const response = await integrationApp.fetch(
      await signedRequest(
        {
          id: "323459",
          application_id: applicationId,
          type: 2,
          token: "merchant-command",
          guild_id: guildId,
          data: {
            name: "mercador",
            options: [
              { name: "busca", type: 3, value: "tocha" },
              { name: "disponibilidade", type: 3, value: "available" },
            ],
          },
        },
        keys.privateKey,
      ),
      env,
      executionContext(),
    );
    const body = (await response.json()) as {
      data: { embeds: Array<{ fields: Array<{ name: string }> }>; components: unknown };
    };
    expect(response.status).toBe(200);
    expect(body.data.embeds[0]?.fields).toEqual([
      expect.objectContaining({ name: "Tocha" }),
    ]);
    expect(JSON.stringify(body.data.components)).toContain("https://ordem.example/mercador");
  });

  it("oferece autocomplete das tags do fórum escolhido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => forumChannelResponse()),
    );
    const response = await integrationApp.fetch(
      await signedRequest(
        {
          id: "223458",
          application_id: applicationId,
          type: 4,
          token: "autocomplete",
          guild_id: guildId,
          data: {
            name: "post",
            options: [
              { name: "forum", type: 7, value: forumChannelId },
              { name: "tag", type: 3, value: "rel", focused: true },
            ],
          },
        },
        keys.privateKey,
      ),
      env,
      executionContext(),
    );

    expect(await response.json()).toEqual({
      type: 8,
      data: { choices: [{ name: "Relato", value: forumTagId }] },
    });
  });

  it("recusa um destino que não seja canal de fórum", async () => {
    const response = await integrationApp.fetch(
      await signedRequest(
        {
          id: "223457",
          application_id: applicationId,
          type: 2,
          token: "command",
          guild_id: guildId,
          data: {
            name: "post",
            options: [{ name: "forum", type: 7, value: forumChannelId }],
            resolved: {
              channels: {
                [forumChannelId]: {
                  id: forumChannelId,
                  name: "geral",
                  type: 0,
                },
              },
            },
          },
        },
        keys.privateKey,
      ),
      env,
      executionContext(),
    );
    const body = (await response.json()) as { type: number };
    expect(body.type).toBe(4);
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
      guild_id: guildId,
      channel_id: "323456789012345678",
      member: { user: { id: discordUserId, username: "guardiao" } },
      data: {
        custom_id: `post:create:v3:${forumChannelId}:${forumTagId}`,
        components: [
          { type: 1, components: [{ type: 4, custom_id: "post_persona", value: "Aster" }] },
          { type: 1, components: [{ type: 4, custom_id: "post_avatar_url", value: "https://cdn.example/aster.png" }] },
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
    expect(db.targets.get("cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toMatchObject({
      persona_name: "Aster",
      persona_avatar_url: "https://cdn.example/aster.png",
    });
  });

  it("publica uma única thread e registra a associação", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith(`/channels/${forumChannelId}/threads`)) {
          return Response.json({ id: "523456789012345678", message: { id: "623456789012345678" } });
        }
        if (url.endsWith("/users/@me/channels")) {
          return Response.json({ id: "723456789012345678" });
        }
        if (url.endsWith("/channels/723456789012345678/messages")) {
          return Response.json({ id: "823456789012345678" });
        }
        void init;
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
    db.targets.set(body.postId, {
      campaign_id: campaignId,
      guild_id: guildId,
      forum_channel_id: forumChannelId,
      forum_tag_id: forumTagId,
      discord_user_id: discordUserId,
      persona_name: null,
      persona_avatar_url: null,
    });
    const batch = {
      messages: [{ body, ack, retry }],
    } as unknown as PublicationBatch;

    await handlePublicationBatch(batch, env);
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(db.links.has(body.postId)).toBe(true);
    expect(portalFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/api/internal/integration/discord/publications"),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${forumChannelId}/threads`),
      expect.any(Object),
    );
    const threadCall = vi.mocked(fetch).mock.calls.find(([input]) =>
      String(input).includes(`/channels/${forumChannelId}/threads`),
    );
    const threadPayload = JSON.parse(String(threadCall?.[1]?.body)) as {
      applied_tags: string[];
      message: { content: string; embeds?: unknown };
    };
    expect(threadPayload.applied_tags).toEqual([forumTagId]);
    expect(threadPayload.message.content).toContain("A chama foi vista ao norte.");
    expect(threadPayload.message.content).toContain(
      "Ver este e outros registros no Portal da Ordem",
    );
    expect(threadPayload.message.embeds).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/channels/723456789012345678/messages"),
      expect.objectContaining({ method: "POST" }),
    );

    const duplicateAck = vi.fn();
    await handlePublicationBatch(
      { messages: [{ body, ack: duplicateAck, retry: vi.fn() }] } as unknown as PublicationBatch,
      env,
    );
    expect(duplicateAck).toHaveBeenCalledOnce();
    expect(
      vi.mocked(fetch).mock.calls.filter(([input]) =>
        String(input).includes(`/channels/${forumChannelId}/threads`),
      ),
    ).toHaveLength(1);
  });

  it("mantém compatibilidade com identificadores dos modais anteriores", () => {
    expect(postTargetFromModal(`post:create:v2:${forumChannelId}:${forumTagId}`)).toEqual({
      forumChannelId,
      forumTagId,
    });
    expect(postTargetFromModal(`post:create:v1:${forumChannelId}`)).toEqual({
      forumChannelId,
      forumTagId: null,
    });
  });

  it("publica no fórum com nome e avatar narrativos por webhook", async () => {
    const webhookId = "923456789012345678";
    const webhookToken = "webhook-token-not-persisted";
    portalFetch.mockImplementation(async (request: Request) => {
      if (request.url.endsWith("/api/internal/integration/discord/publications")) {
        return Response.json({ ok: true });
      }
      return Response.json({
        post: {
          ...postFixture("published"),
          body: "> Escrito por **Aster**\n\nA chama foi vista ao norte.",
        },
      });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith(`/channels/${forumChannelId}/webhooks`)) {
          if (init?.method !== "POST") return Response.json([]);
          return Response.json({
            id: webhookId,
            token: webhookToken,
            type: 1,
            name: "Ordem · Publicações",
            channel_id: forumChannelId,
            application_id: applicationId,
          });
        }
        if (url.includes(`/webhooks/${webhookId}/${webhookToken}?wait=true`)) {
          return Response.json({
            id: "933456789012345678",
            channel_id: "943456789012345678",
          });
        }
        if (url.endsWith("/users/@me/channels")) {
          return Response.json({ id: "723456789012345678" });
        }
        if (url.endsWith("/channels/723456789012345678/messages")) {
          return Response.json({ id: "823456789012345678" });
        }
        return Response.json({});
      }),
    );
    const postId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    db.targets.set(postId, {
      campaign_id: campaignId,
      guild_id: guildId,
      forum_channel_id: forumChannelId,
      forum_tag_id: forumTagId,
      discord_user_id: discordUserId,
      persona_name: "Aster",
      persona_avatar_url: "https://cdn.example/aster.png",
    });
    const ack = vi.fn();
    await handlePublicationBatch(
      {
        messages: [{
          body: {
            type: "discord.post.publish",
            version: 1,
            postId,
            campaignId,
            correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
          ack,
          retry: vi.fn(),
        }],
      } as unknown as PublicationBatch,
      env,
    );

    expect(ack).toHaveBeenCalledOnce();
    const webhookCall = vi.mocked(fetch).mock.calls.find(([input]) =>
      String(input).includes(`/webhooks/${webhookId}/${webhookToken}?wait=true`),
    );
    expect(webhookCall).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${forumChannelId}/webhooks`),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bot bot-token" }),
      }),
    );
    const payload = JSON.parse(String(webhookCall?.[1]?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      username: "Aster",
      avatar_url: "https://cdn.example/aster.png",
      thread_name: "Sinais no ermo",
      applied_tags: [forumTagId],
      allowed_mentions: { parse: [] },
    });
    expect(String(payload.content)).toContain("A chama foi vista ao norte.");
    expect(String(payload.content)).not.toContain("Escrito por");
    expect(db.links.get(postId)).toMatchObject({
      thread_id: "943456789012345678",
      starter_message_id: "933456789012345678",
    });
    expect(JSON.stringify([...db.targets.values(), ...db.links.values()])).not.toContain(webhookToken);
  });

  it("reutiliza o webhook gerenciado do fórum sem criar outro", async () => {
    const webhookId = "923456789012345678";
    const webhookToken = "existing-webhook-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith(`/channels/${forumChannelId}/webhooks`)) {
          return Response.json([{
            id: webhookId,
            token: webhookToken,
            type: 1,
            name: "Ordem · Publicações",
            channel_id: forumChannelId,
            user: { id: applicationId },
          }]);
        }
        if (url.includes(`/webhooks/${webhookId}/${webhookToken}?wait=true`)) {
          return Response.json({
            id: "933456789012345678",
            channel_id: "943456789012345678",
          });
        }
        if (url.endsWith("/users/@me/channels")) {
          return Response.json({ id: "723456789012345678" });
        }
        if (url.endsWith("/channels/723456789012345678/messages")) {
          return Response.json({ id: "823456789012345678" });
        }
        void init;
        return Response.json({});
      }),
    );
    const postId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    db.targets.set(postId, {
      campaign_id: campaignId,
      guild_id: guildId,
      forum_channel_id: forumChannelId,
      forum_tag_id: forumTagId,
      discord_user_id: discordUserId,
      persona_name: "Aster",
      persona_avatar_url: null,
    });

    await handlePublicationBatch(
      {
        messages: [{
          body: {
            type: "discord.post.publish",
            version: 1,
            postId,
            campaignId,
            correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
          ack: vi.fn(),
          retry: vi.fn(),
        }],
      } as unknown as PublicationBatch,
      env,
    );

    const webhookManagementCalls = vi.mocked(fetch).mock.calls.filter(([input]) =>
      String(input).endsWith(`/channels/${forumChannelId}/webhooks`),
    );
    expect(webhookManagementCalls).toHaveLength(1);
    expect(webhookManagementCalls[0]?.[1]?.method).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/webhooks/${webhookId}/${webhookToken}?wait=true`),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("usa o bot quando o fórum não permite gerenciar webhooks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith(`/channels/${forumChannelId}/webhooks`)) {
          return Response.json(
            { code: 50013, message: "Missing Permissions" },
            { status: 403 },
          );
        }
        if (url.endsWith(`/channels/${forumChannelId}/threads`)) {
          return Response.json({ id: "953456789012345678", message: { id: "963456789012345678" } });
        }
        if (url.endsWith("/users/@me/channels")) {
          return Response.json({ id: "723456789012345678" });
        }
        if (url.endsWith("/channels/723456789012345678/messages")) {
          return Response.json({ id: "823456789012345678" });
        }
        return Response.json({});
      }),
    );
    const postId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    db.targets.set(postId, {
      campaign_id: campaignId,
      guild_id: guildId,
      forum_channel_id: forumChannelId,
      forum_tag_id: forumTagId,
      discord_user_id: discordUserId,
      persona_name: "Aster",
      persona_avatar_url: null,
    });
    const ack = vi.fn();
    await handlePublicationBatch(
      {
        messages: [{
          body: {
            type: "discord.post.publish",
            version: 1,
            postId,
            campaignId,
            correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
          ack,
          retry: vi.fn(),
        }],
      } as unknown as PublicationBatch,
      env,
    );

    expect(ack).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${forumChannelId}/threads`),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("avisa o autor por DM quando a entrega esgota as tentativas", async () => {
    const dmMessages: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith(`/channels/${forumChannelId}/threads`)) {
          return Response.json(
            { code: 50035, message: "Invalid Form Body" },
            { status: 400 },
          );
        }
        if (url.endsWith("/users/@me/channels")) {
          return Response.json({ id: "723456789012345678" });
        }
        if (url.endsWith("/channels/723456789012345678/messages")) {
          dmMessages.push(JSON.parse(String(init?.body)));
          return Response.json({ id: "823456789012345678" });
        }
        return Response.json({});
      }),
    );
    const postId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    db.targets.set(postId, {
      campaign_id: campaignId,
      guild_id: guildId,
      forum_channel_id: forumChannelId,
      forum_tag_id: forumTagId,
      discord_user_id: discordUserId,
      persona_name: null,
      persona_avatar_url: null,
    });
    db.deliveries.set(`post:${postId}:forum:v1`, {
      status: "failed",
      externalId: null,
      attempts: 5,
    });
    const retry = vi.fn();
    const body: DiscordPostPublication = {
      type: "discord.post.publish",
      version: 1,
      postId,
      campaignId,
      correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };

    await handlePublicationBatch(
      { messages: [{ body, ack: vi.fn(), retry }] } as unknown as PublicationBatch,
      env,
    );

    expect(retry).toHaveBeenCalledOnce();
    expect(dmMessages).toHaveLength(1);
    expect(dmMessages[0]).toMatchObject({
      content: expect.stringContaining("Não foi possível publicar"),
    });
    expect(db.deliveries.get(`post:${postId}:forum:v1`)?.attempts).toBe(6);
  });
});

function forumChannelResponse(): Response {
  return Response.json({
    id: forumChannelId,
    guild_id: guildId,
    type: 15,
    flags: 16,
    available_tags: [
      { id: forumTagId, name: "Relato" },
      { id: "243456789012345678", name: "Missão" },
    ],
  });
}

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
  readonly deliveries = new Map<string, { status: "pending" | "succeeded" | "failed"; externalId: string | null; attempts: number }>();
  readonly targets = new Map<string, { campaign_id: string; guild_id: string; forum_channel_id: string; forum_tag_id: string | null; discord_user_id: string; persona_name: string | null; persona_avatar_url: string | null }>();
  readonly links = new Map<string, {
    post_id: string;
    campaign_id: string;
    guild_id: string;
    forum_channel_id: string;
    forum_tag_id: string | null;
    thread_id: string;
    starter_message_id: string | null;
    published_at: string;
  }>();
  merchantCatalog: {
    campaign_id: string;
    last_seen_at: string | null;
    connection_status: "online" | "offline";
    merchant_name: string | null;
    captured_at: string | null;
    items_json: string | null;
  } | null = null;

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
    if (this.sql.includes("FROM foundry_worlds fw")) {
      return this.db.merchantCatalog as T | null;
    }
    if (this.sql.includes("FROM integration_inbox_events")) {
      const row = this.db.inbox.get(String(this.args[0]));
      return (row
        ? { status: row.status, result_entity_id: row.result, attempts: row.attempts }
        : null) as T | null;
    }
    if (this.sql.includes("FROM discord_post_targets")) {
      return (this.db.targets.get(String(this.args[0])) ?? null) as T | null;
    }
    if (this.sql.includes("FROM discord_post_links")) {
      return (this.db.links.get(String(this.args[0])) ?? null) as T | null;
    }
    if (this.sql.includes("FROM integration_deliveries")) {
      const row = this.db.deliveries.get(String(this.args[0]));
      return (row
        ? { status: row.status, external_id: row.externalId, attempts: row.attempts }
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
        this.db.deliveries.set(key, { status: "pending", externalId: null, attempts: 0 });
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
        row.attempts += 1;
      }
    } else if (this.sql.includes("INSERT OR IGNORE INTO discord_post_targets")) {
      this.db.targets.set(String(this.args[1]), {
        campaign_id: String(this.args[3]),
        guild_id: String(this.args[4]),
        forum_channel_id: String(this.args[5]),
        forum_tag_id: this.args[6] === null ? null : String(this.args[6]),
        discord_user_id: String(this.args[7]),
        persona_name: this.args[8] === null ? null : String(this.args[8]),
        persona_avatar_url: this.args[9] === null ? null : String(this.args[9]),
      });
    } else if (this.sql.includes("INSERT OR IGNORE INTO discord_post_links")) {
      this.db.links.set(String(this.args[1]), {
        post_id: String(this.args[1]),
        campaign_id: String(this.args[2]),
        guild_id: String(this.args[3]),
        forum_channel_id: String(this.args[4]),
        thread_id: String(this.args[5]),
        starter_message_id: this.args[6] === null ? null : String(this.args[6]),
        published_at: String(this.args[7]),
        forum_tag_id: this.args[8] === null ? null : String(this.args[8]),
      });
    }
    return { success: true, meta: { changes } };
  }
}
