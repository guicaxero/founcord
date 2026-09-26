import { MerchantStockApplyInputSchema, MerchantStockDrawSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { applyStockDraw } from "@/server/merchant/stock-draws";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; drawId: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const { campaignId, drawId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const input = await parseJson(request, MerchantStockApplyInputSchema);
    return jsonResponse(
      MerchantStockDrawSchema.parse(
        await applyStockDraw(await requireSession(request), campaignId, drawId, input.worldId, correlationId),
      ),
      {},
      correlationId,
    );
  })(request);
}
