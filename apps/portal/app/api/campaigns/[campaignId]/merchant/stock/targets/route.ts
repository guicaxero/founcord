import { MerchantStockTargetListResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { listStockTargets } from "@/server/merchant/stock-draws";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      MerchantStockTargetListResponseSchema.parse({
        data: await listStockTargets(await requireSession(request), campaignId, correlationId),
      }),
      {},
      correlationId,
    ),
  )(request);
}
