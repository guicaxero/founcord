import { DiscordForumListResponseSchema } from "@ordem/contracts";
import { listDiscordForums } from "@/server/campaign/discord-import";
import { requireSession } from "@/server/identity/session";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Fóruns do servidor do Discord, para importar crônicas. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      DiscordForumListResponseSchema.parse({
        data: await listDiscordForums(await requireSession(request), campaignId, correlationId),
      }),
      {},
      correlationId,
    ),
  )(request);
}
