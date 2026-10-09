import { MerchantStockPatchSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { getStockPatch } from "@/server/merchant/stock-patches";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; patchId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId, patchId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      MerchantStockPatchSchema.parse(await getStockPatch(await requireSession(request), campaignId, patchId)),
      {},
      correlationId,
    ),
  )(request);
}
