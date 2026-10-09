import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscordPostPublication, Post } from "@ordem/contracts";
import integrationWorker, { handlePublicationBatch, integrationApp } from "./index";
import { guildCommands } from "./commands";
import { guildCommandsMatch } from "./discord-client";
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

  it("registra /post, /lojista e /personagem sem expor o Bot Token", async () => {
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
    expect(commands[1]).toMatchObject({ name: "lojista" });
    expect(commands[2]).toMatchObject({
      name: "personagem",
      description: "Abre sua ficha vinculada à campanha no portal da Ordem.",
    });
  });

  it("compara os comandos ignorando os metadados do Discord", () => {
    // O Discord devolve ids, versões e omite campos falsos.
    const remote = guildCommands.map((command, index) => {
      const options = "options" in command ? (command.options as readonly Record<string, unknown>[]) : [];
      return {
        ...command,
        id: `9${index}`,
        version: "1",
        application_id: applicationId,
        options: options.map((option) => {
          const copy: Record<string, unknown> = { ...option };
          if (copy.required === false) delete copy.required;
          return copy;
        }),
      };
    });
    expect(guildCommandsMatch([...remote].reverse())).toBe(true);
    const renamed = remote.map((command) => (command.name === "lojista" ? { ...command, name: "mercador" } : command));
    expect(guildCommandsMatch(renamed)).toBe(false);
  });

  it("registra os comandos no agendamento só quando mudaram", async () => {
    let registered: unknown[] = guildCommands.map((command) => ({ ...command, name: command.name === "lojista" ? "mercador" : command.name }));
    const discordFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") {
        registered = JSON.parse(String(init.body)) as unknown[];
        return Response.json(registered.map((command, index) => ({ id: String(index), ...(command as object) })));
      }
      return Response.json(registered);
    });
    vi.stubGlobal("fetch", discordFetch);
    const runSchedule = async () => {
      const pending: Promise<unknown>[] = [];
      integrationWorker.scheduled?.(
        { cron: "23 * * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController,
        env,
        { waitUntil: (promise: Promise<unknown>) => pending.push(promise), passThroughOnException() {} } as unknown as ExecutionContext,
      );
      await Promise.all(pending);
    };

    await runSchedule();
    expect(discordFetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
    expect((registered as Array<{ name: string }>).map((command) => command.name)).toContain("lojista");

    await runSchedule();
    expect(discordFetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
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

  it("consulta o Lojista com filtro de disponibilidade e link para o portal", async () => {
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
            name: "lojista",
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
      expect.objectContaining({
        name: "Tocha",
        value: expect.stringContaining("**Preço:** 1 centavo de cobre"),
      }),
    ]);
    expect(JSON.stringify(body.data.components)).toContain("https://ordem.example/lojista");
  });

  it("aceita o nome antigo /mercador até o novo registro de comandos", async () => {
    const response = await integrationApp.fetch(
      await signedRequest(
        {
          id: "323461",
          application_id: applicationId,
          type: 2,
          token: "legacy-merchant-command",
          guild_id: guildId,
          data: { name: "mercador", options: [] },
        },
        keys.privateKey,
      ),
      env,
      executionContext(),
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain("https://ordem.example/lojista");
  });

  it("encaminha /personagem de forma privada para a área autenticada", async () => {
    const response = await integrationApp.fetch(
      await signedRequest(
        {
          id: "323460",
          application_id: applicationId,
          type: 2,
          token: "character-command",
          guild_id: guildId,
          data: { name: "personagem" },
        },
        keys.privateKey,
      ),
      env,
      executionContext(),
    );
    const body = (await response.json()) as {
      type: number;
      data: { content: string; flags: number; components: unknown };
    };
    expect(response.status).toBe(200);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("ficha é privada");
    expect(JSON.stringify(body.data.components)).toContain(
      "https://ordem.example/personagem",
    );
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

  it("publica a atividade da Sede no tópico do Corvo sem menções", async () => {
    const threadId = "523456789012345678";
    const discordFetch = vi.fn(async () => Response.json({ id: "623456789012345678" }));
    vi.stubGlobal("fetch", discordFetch);
    const ack = vi.fn();
    const retry = vi.fn();
    const body = {
      type: "discord.registro.message",
      version: 1,
      campaignId,
      threadId,
      content: "🪶 **Vida na Sede** · Aster escolheu **Escriba — Pesquisa** @everyone",
      correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reference: { kind: "sede_declaration", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", event: "declared" },
    };
    await handlePublicationBatch({ messages: [{ body, ack, retry, attempts: 1 }] } as unknown as PublicationBatch, env);
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    const [url, init] = discordFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/channels/${threadId}/messages`);
    expect(JSON.parse(String(init.body))).toEqual({ content: body.content, allowed_mentions: { parse: [] } });

    // Falha do Discord: repete pela fila e, na sexta tentativa, desiste sem travar a fila.
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Missing Access", code: 50001 }, { status: 403 })));
    const failingRetry = vi.fn();
    await handlePublicationBatch(
      { messages: [{ body, ack: vi.fn(), retry: failingRetry, attempts: 1 }] } as unknown as PublicationBatch,
      env,
    );
    expect(failingRetry).toHaveBeenCalledOnce();
    const lastAck = vi.fn();
    await handlePublicationBatch(
      { messages: [{ body, ack: lastAck, retry: vi.fn(), attempts: 6 }] } as unknown as PublicationBatch,
      env,
    );
    expect(lastAck).toHaveBeenCalledOnce();
  });

  it("lista os tópicos do Registro do Corvo só para o portal", async () => {
    const forumId = "1536153443985531000";
    const registroEnv = { ...env, REGISTRO_DO_CORVO_CHANNEL_ID: forumId };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes("/threads/active")
          ? Response.json({
              threads: [
                { id: "711111111111111111", name: "Aster", parent_id: forumId, thread_metadata: { archived: false } },
                { id: "722222222222222222", name: "Outro fórum", parent_id: "999999999999999999" },
              ],
            })
          : Response.json({
              threads: [{ id: "733333333333333333", name: "Vesper", parent_id: forumId, thread_metadata: { archived: true } }],
            }),
      ),
    );
    const path = "https://integration.example/internal/discord/registro/threads";
    const unauthorized = await integrationApp.fetch(new Request(path), registroEnv, executionContext());
    expect(unauthorized.status).toBe(401);
    const response = await integrationApp.fetch(
      new Request(path, { headers: { authorization: `Bearer ${env.INTEGRATION_SERVICE_TOKEN}` } }),
      registroEnv,
      executionContext(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        { id: "711111111111111111", name: "Aster", archived: false, guildId },
        { id: "733333333333333333", name: "Vesper", archived: true, guildId },
      ],
    });
  });

  it("lê fóruns, tópicos e a mensagem inicial para a importação de crônicas", async () => {
    const forumId = "1536153443985531111";
    const threadId = "1290000000000000000";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith(`/guilds/${guildId}/channels`)) {
          return Response.json([
            { id: "1000000000000000001", name: "taverna", type: 0, position: 1 },
            { id: forumId, name: "códice-dos-corvos", type: 15, position: 2 },
          ]);
        }
        if (url.includes("/threads/active")) {
          return Response.json({ threads: [{ id: threadId, name: "Ecos", parent_id: forumId, thread_metadata: { archived: false } }] });
        }
        if (url.includes("/threads/archived/public")) return Response.json({ threads: [], has_more: false });
        if (url.endsWith(`/channels/${threadId}`)) return Response.json({ id: threadId, name: "Ecos na Floresta", parent_id: forumId });
        if (url.endsWith(`/channels/${threadId}/messages/${threadId}`)) {
          return Response.json({
            id: threadId,
            content: "Com <@123456789012345678> e <:corvo:998877665544332211> na <#1000000000000000001>.",
            timestamp: "2026-10-05T21:04:00.000000+00:00",
            author: { username: "guardiao", global_name: "Guardião da Chama" },
            mentions: [{ id: "123456789012345678", username: "argent", global_name: "Argent" }],
            attachments: [{ url: "https://cdn.discordapp.com/a/capa.png", filename: "capa.png", content_type: "image/png", size: 1234 }],
          });
        }
        return Response.json({ message: "unexpected" }, { status: 404 });
      }),
    );
    const call = (path: string, authorized = true) =>
      integrationApp.fetch(
        new Request(`https://integration.example${path}`, {
          headers: authorized ? { authorization: `Bearer ${env.INTEGRATION_SERVICE_TOKEN}` } : {},
        }),
        env,
        executionContext(),
      );

    expect((await call("/internal/discord/forums", false)).status).toBe(401);
    expect(await (await call("/internal/discord/forums")).json()).toEqual({ data: [{ id: forumId, name: "códice-dos-corvos" }] });
    const threads = (await (await call(`/internal/discord/forums/${forumId}/threads`)).json()) as { data: { threadId: string }[] };
    expect(threads.data.map((thread) => thread.threadId)).toEqual([threadId]);
    expect((await call("/internal/discord/forums/abc/threads")).status).toBe(422);
    const starter = (await (await call(`/internal/discord/threads/${threadId}/starter`)).json()) as Record<string, unknown>;
    expect(starter).toMatchObject({
      threadId,
      forumChannelId: forumId,
      title: "Ecos na Floresta",
      authorName: "Guardião da Chama",
      content: "Com @Argent e :corvo: na #canal.",
      createdAt: "2026-10-05T21:04:00.000Z",
    });
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
    coverMediaId: null,
    galleryMediaIds: [],
    discordThreadId: null,
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
