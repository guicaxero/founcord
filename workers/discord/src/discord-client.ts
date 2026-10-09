import type { Post } from "@ordem/contracts";
import { guildCommands } from "./commands";
import type { IntegrationEnv } from "./types";

export type DiscordThread = Readonly<{
  id: string;
  messageId: string | null;
}>;

export type RegisteredDiscordCommand = Readonly<{
  id: string;
  name: string;
}>;

export type DiscordForumTag = Readonly<{
  id: string;
  name: string;
}>;

export type DiscordForumChannel = Readonly<{
  id: string;
  guildId: string;
  requiresTag: boolean;
  tags: readonly DiscordForumTag[];
}>;

export async function registerGuildCommands(
  env: IntegrationEnv,
): Promise<readonly RegisteredDiscordCommand[]> {
  const response = await fetch(
    `${apiBase(env)}/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
    {
      method: "PUT",
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(guildCommands),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Discord command registration failed with ${response.status}.`);
  }
  if (!Array.isArray(body)) throw new Error("Discord returned invalid commands.");

  return body.map((command) => {
    if (
      !command ||
      typeof command !== "object" ||
      typeof (command as { id?: unknown }).id !== "string" ||
      typeof (command as { name?: unknown }).name !== "string"
    ) {
      throw new Error("Discord returned an invalid command.");
    }
    return {
      id: (command as { id: string }).id,
      name: (command as { name: string }).name,
    };
  });
}

export async function getForumChannel(
  env: IntegrationEnv,
  forumChannelId: string,
): Promise<DiscordForumChannel> {
  const response = await fetch(`${apiBase(env)}/channels/${forumChannelId}`, {
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw discordApiError("forum lookup", response.status, body);
  }
  if (!body || typeof body !== "object") {
    throw new Error("Discord returned an invalid forum channel.");
  }
  const record = body as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    record.type !== 15 ||
    typeof record.guild_id !== "string"
  ) {
    throw new Error("Discord returned an invalid forum channel.");
  }
  const tags = Array.isArray(record.available_tags)
    ? record.available_tags.flatMap((tag) => {
        if (!tag || typeof tag !== "object") return [];
        const candidate = tag as Record<string, unknown>;
        return typeof candidate.id === "string" && typeof candidate.name === "string"
          ? [{ id: candidate.id, name: candidate.name }]
          : [];
      })
    : [];
  return {
    id: record.id,
    guildId: record.guild_id,
    requiresTag:
      typeof record.flags === "number" && (record.flags & FORUM_REQUIRE_TAG_FLAG) !== 0,
    tags,
  };
}

export function forumTagChoices(
  forum: DiscordForumChannel,
  query: string,
): readonly Readonly<{ name: string; value: string }>[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  return forum.tags
    .filter(
      (tag) =>
        !normalizedQuery ||
        tag.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
    )
    .slice(0, 25)
    .map((tag) => ({ name: truncate(tag.name, 100), value: tag.id }));
}

export async function editOriginalInteraction(
  env: IntegrationEnv,
  applicationId: string,
  interactionToken: string,
  payload: unknown,
): Promise<void> {
  const response = await fetch(
    `${apiBase(env)}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw new Error(`Discord follow-up failed with ${response.status}.`);
}

export async function createForumThread(
  env: IntegrationEnv,
  post: Post,
  forumChannelId: string,
  forumTagId: string | null,
  identity: Readonly<{ name: string | null; avatarUrl: string | null }>,
): Promise<DiscordThread> {
  if (identity.name || identity.avatarUrl) {
    try {
      const webhook = await getOrCreateManagedWebhook(env, forumChannelId);
      return await createForumThreadWithWebhook(
        env,
        webhook,
        post,
        forumTagId,
        identity,
      );
    } catch (error) {
      if (!(error instanceof WebhookUnavailableError)) throw error;
      console.warn(JSON.stringify({
        level: "warn",
        code: "discord_webhook_fallback",
        forumChannelId,
        reason: error.message,
      }));
    }
  }
  const response = await fetch(
    `${apiBase(env)}/channels/${forumChannelId}/threads`,
    {
      method: "POST",
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: truncate(post.title, 100),
        ...(forumTagId ? { applied_tags: [forumTagId] } : {}),
        message: {
          content: forumPostContent(post.body, env.SITE_URL),
          allowed_mentions: { parse: [] },
        },
      }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw discordApiError("forum publication", response.status, body);
  }
  if (!body || typeof body !== "object" || typeof (body as { id?: unknown }).id !== "string") {
    throw new Error("Discord returned an invalid thread.");
  }
  const record = body as { id: string; message?: { id?: unknown } };
  return {
    id: record.id,
    messageId: typeof record.message?.id === "string" ? record.message.id : null,
  };
}

type ManagedWebhook = Readonly<{ id: string; token: string }>;

async function getOrCreateManagedWebhook(
  env: IntegrationEnv,
  forumChannelId: string,
): Promise<ManagedWebhook> {
  const listResponse = await fetch(
    `${apiBase(env)}/channels/${forumChannelId}/webhooks`,
    { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } },
  );
  const listBody: unknown = await listResponse.json().catch(() => null);
  if (!listResponse.ok) {
    throw new WebhookUnavailableError(
      safeDiscordFailure("lookup", listResponse.status, listBody),
    );
  }
  if (!Array.isArray(listBody)) {
    throw new WebhookUnavailableError("Discord returned invalid webhook metadata.");
  }
  const existing = listBody.find((candidate) => isManagedWebhook(
    candidate,
    env.DISCORD_APPLICATION_ID,
    forumChannelId,
  ));
  if (existing) return webhookCredentials(existing);

  const createResponse = await fetch(
    `${apiBase(env)}/channels/${forumChannelId}/webhooks`,
    {
      method: "POST",
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: MANAGED_WEBHOOK_NAME }),
    },
  );
  const createBody: unknown = await createResponse.json().catch(() => null);
  if (!createResponse.ok) {
    throw new WebhookUnavailableError(
      safeDiscordFailure("creation", createResponse.status, createBody),
    );
  }
  try {
    return webhookCredentials(createBody);
  } catch {
    throw new WebhookUnavailableError("Discord returned an invalid created webhook.");
  }
}

async function createForumThreadWithWebhook(
  env: IntegrationEnv,
  webhook: ManagedWebhook,
  post: Post,
  forumTagId: string | null,
  identity: Readonly<{ name: string | null; avatarUrl: string | null }>,
): Promise<DiscordThread> {
  const content = identity.name
    ? removePersonaAttribution(post.body, identity.name)
    : post.body;
  const response = await fetch(
    `${apiBase(env)}/webhooks/${webhook.id}/${webhook.token}?wait=true`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        thread_name: truncate(post.title, 100),
        ...(forumTagId ? { applied_tags: [forumTagId] } : {}),
        ...(identity.name ? { username: identity.name } : {}),
        ...(identity.avatarUrl ? { avatar_url: identity.avatarUrl } : {}),
        content: forumPostContent(content, env.SITE_URL),
        allowed_mentions: { parse: [] },
      }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw discordApiError("webhook forum publication", response.status, body);
  }
  if (!body || typeof body !== "object") {
    throw new Error("Discord returned an invalid webhook message.");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.channel_id !== "string") {
    throw new Error("Discord returned an invalid webhook message.");
  }
  return { id: record.channel_id, messageId: record.id };
}

export async function sendDirectMessage(
  env: IntegrationEnv,
  discordUserId: string,
  payload: unknown,
): Promise<void> {
  const channelResponse = await fetch(`${apiBase(env)}/users/@me/channels`, {
    method: "POST",
    headers: {
      authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  const channelBody: unknown = await channelResponse.json().catch(() => null);
  if (!channelResponse.ok) {
    throw discordApiError("DM channel creation", channelResponse.status, channelBody);
  }
  if (
    !channelBody ||
    typeof channelBody !== "object" ||
    typeof (channelBody as { id?: unknown }).id !== "string"
  ) {
    throw new Error("Discord returned an invalid DM channel.");
  }
  const channelId = (channelBody as { id: string }).id;
  const messageResponse = await fetch(`${apiBase(env)}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const messageBody: unknown = await messageResponse.json().catch(() => null);
  if (!messageResponse.ok) {
    throw discordApiError("DM delivery", messageResponse.status, messageBody);
  }
}

function apiBase(env: IntegrationEnv): string {
  return env.DISCORD_API_BASE_URL ?? "https://discord.com/api/v10";
}

function discordApiError(operation: string, status: number, body: unknown): Error {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const code =
    typeof record?.code === "number" || typeof record?.code === "string"
      ? String(record.code)
      : null;
  const message = typeof record?.message === "string" ? record.message.slice(0, 200) : null;
  const detail = [code, message].filter(Boolean).join(": ");
  return new Error(
    `Discord ${operation} failed with ${status}${detail ? ` (${detail})` : ""}.`,
  );
}

function safeDiscordFailure(operation: string, status: number, body: unknown): string {
  return discordApiError(`webhook ${operation}`, status, body).message;
}

function isManagedWebhook(
  value: unknown,
  applicationId: string,
  forumChannelId: string,
): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const user = record.user && typeof record.user === "object"
    ? record.user as Record<string, unknown>
    : null;
  return record.type === 1 &&
    record.name === MANAGED_WEBHOOK_NAME &&
    record.channel_id === forumChannelId &&
    typeof record.id === "string" &&
    typeof record.token === "string" &&
    (record.application_id === applicationId || user?.id === applicationId);
}

function webhookCredentials(value: unknown): ManagedWebhook {
  if (!value || typeof value !== "object") throw new Error("Invalid webhook.");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.token !== "string") {
    throw new Error("Invalid webhook credentials.");
  }
  return { id: record.id, token: record.token };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function forumPostContent(body: string, siteUrl: string): string {
  const portalLink = `\n\n—\n🔗 [Ver este e outros registros no Portal da Ordem](${siteUrl})`;
  return `${truncate(body, 2_000 - portalLink.length)}${portalLink}`;
}

function removePersonaAttribution(body: string, personaName: string): string {
  const prefix = `> Escrito por **${escapeMarkdown(personaName)}**\n\n`;
  return body.startsWith(prefix) ? body.slice(prefix.length) : body;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()<>#+\-.!|])/g, "\\$1");
}

class WebhookUnavailableError extends Error {}

const FORUM_REQUIRE_TAG_FLAG = 1 << 4;
const MANAGED_WEBHOOK_NAME = "Ordem · Publicações";

type CommandShape = Readonly<Record<string, unknown>>;

/** Campos que definem um comando ou opção; o resto é metadado do Discord. */
function commandSignature(command: CommandShape): unknown {
  const options = Array.isArray(command.options) ? (command.options as CommandShape[]) : [];
  return {
    name: command.name,
    description: command.description,
    type: command.type ?? 1,
    options: options.map((option) => ({
      type: option.type,
      name: option.name,
      description: option.description,
      required: option.required ?? false,
      autocomplete: option.autocomplete ?? false,
      max_length: option.max_length ?? null,
      channel_types: option.channel_types ?? [],
      choices: Array.isArray(option.choices)
        ? (option.choices as CommandShape[]).map((choice) => ({ name: choice.name, value: choice.value }))
        : [],
    })),
  };
}

/** Compara os comandos registrados no Discord com a definição do código. */
export function guildCommandsMatch(
  remote: readonly CommandShape[],
  local: readonly CommandShape[] = guildCommands,
): boolean {
  const sortKey = (command: CommandShape) => String(command.name);
  const normalize = (commands: readonly CommandShape[]) =>
    JSON.stringify([...commands].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(commandSignature));
  return normalize(remote) === normalize(local);
}

/**
 * Mantém os comandos da guild iguais aos do código. Só reenvia a lista quando
 * algo mudou, para não gastar o limite diário de criação de comandos.
 */
export async function syncGuildCommands(
  env: IntegrationEnv,
): Promise<Readonly<{ changed: boolean; commands: readonly string[] }>> {
  const response = await fetch(
    `${apiBase(env)}/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
    { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw discordApiError("command lookup", response.status, body);
  if (!Array.isArray(body)) throw new Error("Discord returned invalid commands.");
  if (guildCommandsMatch(body as CommandShape[])) {
    return { changed: false, commands: (body as CommandShape[]).map((command) => String(command.name)) };
  }
  const registered = await registerGuildCommands(env);
  return { changed: true, commands: registered.map((command) => command.name) };
}

/** Publica no tópico do Corvo, sem menções (o texto vem de jogadores e do mestre). */
export async function sendThreadMessage(env: IntegrationEnv, threadId: string, content: string): Promise<void> {
  const response = await fetch(`${apiBase(env)}/channels/${threadId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw discordApiError("thread message", response.status, body);
}

type ThreadShape = Readonly<{ id?: unknown; name?: unknown; parent_id?: unknown; thread_metadata?: { archived?: unknown } }>;

/** Tópicos do fórum Registro do Corvo: os ativos e os arquivados públicos. */
export async function listForumThreads(
  env: IntegrationEnv,
  forumChannelId: string,
): Promise<readonly Readonly<{ id: string; name: string; archived: boolean }>[]> {
  const headers = { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const [active, archived] = await Promise.all([
    fetch(`${apiBase(env)}/guilds/${env.DISCORD_GUILD_ID}/threads/active`, { headers }),
    fetch(`${apiBase(env)}/channels/${forumChannelId}/threads/archived/public?limit=100`, { headers }),
  ]);
  const activeBody: unknown = await active.json().catch(() => null);
  if (!active.ok) throw discordApiError("active threads", active.status, activeBody);
  const archivedBody: unknown = await archived.json().catch(() => null);
  if (!archived.ok) throw discordApiError("archived threads", archived.status, archivedBody);
  const threadsOf = (body: unknown): ThreadShape[] =>
    body && typeof body === "object" && Array.isArray((body as { threads?: unknown }).threads)
      ? ((body as { threads: ThreadShape[] }).threads)
      : [];
  const seen = new Set<string>();
  return [...threadsOf(activeBody), ...threadsOf(archivedBody)]
    .filter((thread) => thread.parent_id === forumChannelId && typeof thread.id === "string")
    .filter((thread) => (seen.has(thread.id as string) ? false : (seen.add(thread.id as string), true)))
    .map((thread) => ({
      id: thread.id as string,
      name: String(thread.name ?? "").slice(0, 200),
      archived: thread.thread_metadata?.archived === true,
    }));
}

type RawChannel = Readonly<{ id?: unknown; name?: unknown; type?: unknown; parent_id?: unknown; position?: unknown }>;
type RawThread = ThreadShape & Readonly<{ thread_metadata?: { archived?: unknown; archive_timestamp?: unknown } }>;
type RawMessage = Readonly<{
  id?: unknown;
  content?: unknown;
  timestamp?: unknown;
  author?: Readonly<{ username?: unknown; global_name?: unknown }>;
  mentions?: readonly Readonly<{ id?: unknown; username?: unknown; global_name?: unknown }>[];
  attachments?: readonly Readonly<{ url?: unknown; filename?: unknown; content_type?: unknown; size?: unknown }>[];
}>;

const FORUM_TYPES = new Set([15, 16]);
const MAX_ARCHIVED_PAGES = 5;

/** Fóruns (e canais de mídia) do servidor, na ordem do Discord. */
export async function listGuildForums(
  env: IntegrationEnv,
): Promise<readonly Readonly<{ id: string; name: string }>[]> {
  const response = await fetch(`${apiBase(env)}/guilds/${env.DISCORD_GUILD_ID}/channels`, {
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw discordApiError("guild channels", response.status, body);
  return (Array.isArray(body) ? (body as RawChannel[]) : [])
    .filter((channel) => typeof channel.id === "string" && FORUM_TYPES.has(Number(channel.type)))
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
    .map((channel) => ({ id: channel.id as string, name: String(channel.name ?? "").slice(0, 100) }));
}

/**
 * Todos os tópicos de um fórum: os ativos e os arquivados públicos, em até
 * cinco páginas de 100 (os mais recentes primeiro).
 */
export async function listAllForumThreads(
  env: IntegrationEnv,
  forumChannelId: string,
): Promise<readonly Readonly<{ id: string; name: string; archived: boolean }>[]> {
  const headers = { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const found = new Map<string, Readonly<{ id: string; name: string; archived: boolean }>>();
  const add = (threads: readonly RawThread[]) => {
    for (const thread of threads) {
      if (thread.parent_id !== forumChannelId || typeof thread.id !== "string" || found.has(thread.id)) continue;
      found.set(thread.id, {
        id: thread.id,
        name: String(thread.name ?? "").slice(0, 200),
        archived: thread.thread_metadata?.archived === true,
      });
    }
  };
  const active = await fetch(`${apiBase(env)}/guilds/${env.DISCORD_GUILD_ID}/threads/active`, { headers });
  const activeBody: unknown = await active.json().catch(() => null);
  if (!active.ok) throw discordApiError("active threads", active.status, activeBody);
  add(((activeBody as { threads?: RawThread[] } | null)?.threads ?? []));

  let before: string | null = null;
  for (let page = 0; page < MAX_ARCHIVED_PAGES; page += 1) {
    const query: string = before ? `&before=${encodeURIComponent(before)}` : "";
    const archived: Response = await fetch(
      `${apiBase(env)}/channels/${forumChannelId}/threads/archived/public?limit=100${query}`,
      { headers },
    );
    const body: unknown = await archived.json().catch(() => null);
    if (!archived.ok) throw discordApiError("archived threads", archived.status, body);
    const threads = (body as { threads?: RawThread[] } | null)?.threads ?? [];
    add(threads);
    const last = threads.at(-1)?.thread_metadata?.archive_timestamp;
    if (!(body as { has_more?: unknown } | null)?.has_more || typeof last !== "string") break;
    before = last;
  }
  return [...found.values()];
}

/** Mensagem inicial de um tópico de fórum (o id da mensagem é o do tópico). */
export async function getThreadStarter(
  env: IntegrationEnv,
  threadId: string,
): Promise<
  Readonly<{
    forumChannelId: string;
    title: string;
    authorName: string;
    content: string;
    createdAt: string | null;
    mentions: readonly Readonly<{ id: string; name: string }>[];
    attachments: readonly Readonly<{ url: string; filename: string; contentType: string | null; size: number }>[];
  }>
> {
  const headers = { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const [channelResponse, messageResponse] = await Promise.all([
    fetch(`${apiBase(env)}/channels/${threadId}`, { headers }),
    fetch(`${apiBase(env)}/channels/${threadId}/messages/${threadId}`, { headers }),
  ]);
  const channel = (await channelResponse.json().catch(() => null)) as RawChannel | null;
  if (!channelResponse.ok) throw discordApiError("thread lookup", channelResponse.status, channel);
  const message = (await messageResponse.json().catch(() => null)) as RawMessage | null;
  if (!messageResponse.ok) throw discordApiError("starter message", messageResponse.status, message);
  const displayName = (user: { username?: unknown; global_name?: unknown } | undefined) =>
    String(user?.global_name ?? user?.username ?? "").slice(0, 100);
  return {
    forumChannelId: String(channel?.parent_id ?? ""),
    title: String(channel?.name ?? "").slice(0, 200),
    authorName: displayName(message?.author),
    content: typeof message?.content === "string" ? message.content : "",
    createdAt: typeof message?.timestamp === "string" ? message.timestamp : null,
    mentions: (message?.mentions ?? [])
      .filter((mention) => typeof mention.id === "string")
      .map((mention) => ({ id: mention.id as string, name: displayName(mention) })),
    attachments: (message?.attachments ?? [])
      .filter((attachment) => typeof attachment.url === "string")
      .slice(0, 10)
      .map((attachment) => ({
        url: attachment.url as string,
        filename: String(attachment.filename ?? "imagem").slice(0, 260),
        contentType: typeof attachment.content_type === "string" ? attachment.content_type.slice(0, 100) : null,
        size: Number(attachment.size ?? 0) || 0,
      })),
  };
}

export type MissionThreadInput = Readonly<{
  title: string;
  content: string;
  tagIds: readonly string[];
  identity: Readonly<{ name: string | null; avatarUrl: string | null }>;
  image: Readonly<{ data: Uint8Array<ArrayBuffer>; filename: string; contentType: string }> | null;
}>;

/** Corpo multipart do Discord: `payload_json` e a capa como `files[0]`. */
function multipartBody(payload: Record<string, unknown>, image: MissionThreadInput["image"]): FormData {
  const form = new FormData();
  form.set("payload_json", JSON.stringify(payload));
  if (image) {
    form.set("files[0]", new Blob([image.data], { type: image.contentType }), image.filename);
  }
  return form;
}

/**
 * Cria o tópico da missão no fórum. A capa vai como anexo, para o Discord
 * usá-la como imagem do tópico na galeria. Com nome ou avatar narrativo, usa o
 * webhook gerenciado; sem ele, o bot.
 */
export async function createMissionThread(
  env: IntegrationEnv,
  forumChannelId: string,
  input: MissionThreadInput,
): Promise<DiscordThread> {
  const attachments = input.image ? [{ id: 0, filename: input.image.filename }] : [];
  if (input.identity.name || input.identity.avatarUrl) {
    try {
      const webhook = await getOrCreateManagedWebhook(env, forumChannelId);
      const response = await fetch(`${apiBase(env)}/webhooks/${webhook.id}/${webhook.token}?wait=true`, {
        method: "POST",
        body: multipartBody(
          {
            thread_name: truncate(input.title, 100),
            ...(input.tagIds.length > 0 ? { applied_tags: input.tagIds } : {}),
            ...(input.identity.name ? { username: input.identity.name } : {}),
            ...(input.identity.avatarUrl ? { avatar_url: input.identity.avatarUrl } : {}),
            content: input.content,
            attachments,
            allowed_mentions: { parse: [] },
          },
          input.image,
        ),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw discordApiError("webhook mission publication", response.status, body);
      const record = (body ?? {}) as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.channel_id !== "string") {
        throw new Error("Discord returned an invalid webhook message.");
      }
      return { id: record.channel_id, messageId: record.id };
    } catch (error) {
      if (!(error instanceof WebhookUnavailableError)) throw error;
      console.warn(JSON.stringify({ level: "warn", code: "discord_webhook_fallback", forumChannelId, reason: error.message }));
    }
  }
  const response = await fetch(`${apiBase(env)}/channels/${forumChannelId}/threads`, {
    method: "POST",
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    body: multipartBody(
      {
        name: truncate(input.title, 100),
        ...(input.tagIds.length > 0 ? { applied_tags: input.tagIds } : {}),
        message: { content: input.content, attachments, allowed_mentions: { parse: [] } },
      },
      input.image,
    ),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw discordApiError("mission publication", response.status, body);
  const record = (body ?? {}) as { id?: unknown; message?: { id?: unknown } };
  if (typeof record.id !== "string") throw new Error("Discord returned an invalid thread.");
  return { id: record.id, messageId: typeof record.message?.id === "string" ? record.message.id : null };
}
