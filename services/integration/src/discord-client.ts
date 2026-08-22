import type { Post } from "@vigilia/contracts";
import { POST_COMMAND_NAME } from "./discord-components";
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
      body: JSON.stringify([
        {
          name: POST_COMMAND_NAME,
          description: "Cria um post da Ordem e envia para revisão no portal.",
          type: 1,
          dm_permission: false,
          options: [
            {
              type: 7,
              name: "forum",
              description: "Fórum onde o post será publicado após a revisão.",
              required: true,
              channel_types: [15],
            },
            {
              type: 3,
              name: "tag",
              description: "Tag aplicada ao post; obrigatória quando o fórum exigir.",
              required: false,
              autocomplete: true,
            },
          ],
        },
      ]),
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
): Promise<DiscordThread> {
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

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function forumPostContent(body: string, siteUrl: string): string {
  const portalLink = `\n\n—\n🔗 [Ver este e outros registros no Portal da Ordem](${siteUrl})`;
  return `${truncate(body, 2_000 - portalLink.length)}${portalLink}`;
}

const FORUM_REQUIRE_TAG_FLAG = 1 << 4;
