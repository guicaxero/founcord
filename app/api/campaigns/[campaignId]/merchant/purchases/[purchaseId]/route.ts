import {
  MerchantPurchaseDecisionInputSchema,
  MerchantPurchaseRequestSchema,
} from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import { decideMerchantPurchase } from "@/server/domain/merchant-purchases";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";

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
