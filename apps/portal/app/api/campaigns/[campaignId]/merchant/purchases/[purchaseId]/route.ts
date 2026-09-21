import {
  MerchantPurchaseDecisionInputSchema,
  MerchantPurchaseRequestSchema,
} from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { decideMerchantPurchase } from "@/server/campaign/merchant-purchases";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; purchaseId: string }>;
}>;

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId, purchaseId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      MerchantPurchaseRequestSchema.parse(
        await decideMerchantPurchase(
          await requireSession(request),
          campaignId,
          purchaseId,
          await parseJson(request, MerchantPurchaseDecisionInputSchema),
          correlationId,
        ),
      ),
      {},
      correlationId,
    );
  })(request);
}
