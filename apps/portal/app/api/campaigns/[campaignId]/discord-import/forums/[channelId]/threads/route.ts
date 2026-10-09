import { DiscordImportThreadListResponseSchema } from "@ordem/contracts";
import { listDiscordForumThreads } from "@/server/campaign/discord-import";
import { requireSession } from "@/server/identity/session";
import { HttpError, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; channelId: string }> }>;

/** Tópicos de um fórum, marcando os que já estão no portal. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId, channelId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    if (!/^\d{5,25}$/u.test(channelId)) throw new HttpError(422, "invalid_channel", "Fórum inválido.");
    return jsonResponse(
      DiscordImportThreadListResponseSchema.parse({
        data: await listDiscordForumThreads(await requireSession(request), campaignId, channelId, correlationId),
      }),
      {},
      correlationId,
    );
  })(request);
}
