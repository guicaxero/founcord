import {
  DiscordPostDraftResponseSchema,
  DiscordPostPublishedNotificationSchema,
  type CreateDiscordPostDraftInput,
  type DiscordPostPublishedNotification,
  type Post,
} from "@vigilia/contracts";
import type { IntegrationEnv } from "./types";

const INTERNAL_ORIGIN = "https://portal.internal";

export async function createDiscordDraft(
  env: IntegrationEnv,
  input: CreateDiscordPostDraftInput,
  correlationId: string,
): Promise<Post> {
  const response = await env.PORTAL.fetch(
    new Request(`${INTERNAL_ORIGIN}/api/internal/integration/discord/posts`, {
      method: "POST",
      headers: internalHeaders(env, correlationId),
      body: JSON.stringify(input),
    }),
  );
  return parsePortalPost(response);
}

export async function getPublishedPortalPost(
  env: IntegrationEnv,
  postId: string,
  correlationId: string,
): Promise<Post> {
  const response = await env.PORTAL.fetch(
    new Request(
      `${INTERNAL_ORIGIN}/api/internal/integration/discord/posts/${encodeURIComponent(postId)}`,
      { headers: internalHeaders(env, correlationId) },
    ),
  );
  return parsePortalPost(response);
}

export async function notifyPortalOfDiscordPublication(
  env: IntegrationEnv,
  input: DiscordPostPublishedNotification,
  correlationId: string,
): Promise<void> {
  const payload = DiscordPostPublishedNotificationSchema.parse(input);
  const response = await env.PORTAL.fetch(
    new Request(`${INTERNAL_ORIGIN}/api/internal/integration/discord/publications`, {
      method: "POST",
      headers: internalHeaders(env, correlationId),
      body: JSON.stringify(payload),
    }),
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(
      extractErrorMessage(body) ?? `Portal respondeu ${response.status} ao registrar a publicação.`,
    );
  }
}

function internalHeaders(env: IntegrationEnv, correlationId: string): Headers {
  return new Headers({
    authorization: `Bearer ${env.INTEGRATION_SERVICE_TOKEN}`,
    "content-type": "application/json",
    "x-correlation-id": correlationId,
  });
}

async function parsePortalPost(response: Response): Promise<Post> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = extractErrorMessage(body) ?? `Portal respondeu ${response.status}.`;
    throw new Error(message);
  }
  return DiscordPostDraftResponseSchema.parse(body).post;
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : null;
}
