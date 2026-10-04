import { SedeShopResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { getSedeShop } from "@/server/sede/sede";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; activityId: string }> }>;

/** Itens Comuns do Lojista que cabem no limite da atividade. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId, activityId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      SedeShopResponseSchema.parse(await getSedeShop(await requireSession(request), campaignId, activityId)),
      {},
      correlationId,
    ),
  )(request);
}
