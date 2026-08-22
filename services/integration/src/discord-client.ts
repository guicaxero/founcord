import type { Post } from "@vigilia/contracts";
import type { IntegrationEnv } from "./types";

export type DiscordThread = Readonly<{
  id: string;
  messageId: string | null;
}>;

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
        message: {
          content: `Publicado por **${escapeDiscord(post.authorName)}** · ${env.SITE_URL}`,
          embeds: [
            {
              title: truncate(post.title, 256),
              description: truncate(post.body, 4_096),
              color: 0xb78a4a,
              footer: { text: "Ordem da Última Luz · conteúdo revisado" },
            },
          ],
          allowed_mentions: { parse: [] },
        },
      }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Discord forum publication failed with ${response.status}.`);
  if (!body || typeof body !== "object" || typeof (body as { id?: unknown }).id !== "string") {
    throw new Error("Discord returned an invalid thread.");
  }
  const record = body as { id: string; message?: { id?: unknown } };
  return {
    id: record.id,
    messageId: typeof record.message?.id === "string" ? record.message.id : null,
  };
}

function apiBase(env: IntegrationEnv): string {
  return env.DISCORD_API_BASE_URL ?? "https://discord.com/api/v10";
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function escapeDiscord(value: string): string {
  return value.replaceAll("@", "＠").replaceAll("`", "ˋ");
}
