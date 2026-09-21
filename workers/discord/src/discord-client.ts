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
