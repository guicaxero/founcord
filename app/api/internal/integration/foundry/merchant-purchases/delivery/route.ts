import {
  MerchantPurchaseDeliveryCallbackSchema,
  MerchantPurchaseRequestSchema,
} from "@vigilia/contracts";
import { recordMerchantPurchaseDelivery } from "@/server/domain/merchant-purchases";
import { jsonResponse, parseJson, withApiHandler } from "@/server/http";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, MerchantPurchaseDeliveryCallbackSchema);
  return jsonResponse(
    MerchantPurchaseRequestSchema.parse(
      await recordMerchantPurchaseDelivery(input, correlationId),
    ),
    {},
    correlationId,
  );
});
