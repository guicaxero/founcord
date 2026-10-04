import { RegistroThreadListResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { listCampaignRegistroThreads } from "@/server/campaign/characters";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Tópicos do fórum Registro do Corvo, para sugerir o de cada personagem. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      RegistroThreadListResponseSchema.parse({
        data: await listCampaignRegistroThreads(await requireSession(request), campaignId, correlationId),
      }),
      {},
      correlationId,
    ),
  )(request);
}
