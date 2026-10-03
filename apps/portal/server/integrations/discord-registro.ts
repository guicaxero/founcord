import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  DiscordRegistroMessageSchema,
  RegistroThreadListResponseSchema,
  type DiscordRegistroMessage,
  type RegistroThread,
} from "@ordem/contracts";
import { HttpError } from "@/server/shared/http";

const MAX_CONTENT = 2_000;

/** Corta o texto no limite do Discord sem quebrar no meio de uma palavra. */
export function fitDiscordContent(content: string): string {
  if (content.length <= MAX_CONTENT) return content;
  const cut = content.slice(0, MAX_CONTENT - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), MAX_CONTENT - 200))}…`;
}

/**
 * Publica uma mensagem no tópico do Corvo pela fila do Discord. A falha ao
 * enfileirar não interrompe a ação no portal: a atividade continua registrada.
 */
export function enqueueRegistroMessage(message: Omit<DiscordRegistroMessage, "type" | "version">): void {
  const { env, ctx } = getCloudflareContext();
  const queue = env.DISCORD_PUBLICATIONS;
  if (!queue) {
    console.warn(
      JSON.stringify({ level: "warn", code: "discord_registro_queue_unavailable", reference: message.reference }),
    );
    return;
  }
  const body = DiscordRegistroMessageSchema.parse({
    type: "discord.registro.message",
    version: 1,
    ...message,
    content: fitDiscordContent(message.content),
  });
  ctx.waitUntil(
    queue.send(body).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: "error",
          code: "discord_registro_enqueue_failed",
          reference: message.reference,
          correlationId: message.correlationId,
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }),
  );
}

/** Tópicos do fórum Registro do Corvo, consultados no Worker do Discord. */
export async function listRegistroThreads(correlationId: string): Promise<RegistroThread[]> {
  const { env } = getCloudflareContext();
  const token = process.env.INTEGRATION_SERVICE_TOKEN ?? env.INTEGRATION_SERVICE_TOKEN;
  const baseUrl =
    process.env.DISCORD_INTEGRATION_URL ??
    env.DISCORD_INTEGRATION_URL ??
    "https://ordem-discord-integration.ordem-da-ultima-luz.workers.dev";
  if (!token || token.length < 32) {
    throw new HttpError(503, "discord_integration_not_configured", "A conexão com o Discord ainda não está configurada.");
  }
  let response: Response;
  try {
    response = await fetch(new URL("/internal/discord/registro/threads", baseUrl), {
      headers: { authorization: `Bearer ${token}`, "x-correlation-id": correlationId },
    });
  } catch {
    throw new HttpError(503, "discord_integration_unavailable", "Não foi possível consultar o Discord agora. Tente novamente.");
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      "discord_registro_unavailable",
      "O Discord não devolveu os tópicos do Registro do Corvo. Confira se o bot vê o fórum.",
    );
  }
  return RegistroThreadListResponseSchema.parse(await response.json()).data;
}
