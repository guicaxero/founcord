import { EntityIdSchema, MerchantStockCurrentResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { getCurrentStock } from "@/server/merchant/stock-patches";
import { HttpError, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Estoque real do Lojista num mundo, como o módulo sincronizou por último. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    const worldId = EntityIdSchema.safeParse(new URL(request.url).searchParams.get("worldId"));
    if (!worldId.success) throw new HttpError(422, "world_required", "Escolha o mundo do Foundry.");
    return jsonResponse(
      MerchantStockCurrentResponseSchema.parse(
        await getCurrentStock(await requireSession(request), campaignId, worldId.data, correlationId),
      ),
      {},
      correlationId,
    );
  })(request);
}
