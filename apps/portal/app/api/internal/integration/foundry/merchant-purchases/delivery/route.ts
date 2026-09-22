import {
  MerchantPurchaseDeliveryCallbackSchema,
  MerchantPurchaseRequestSchema,
} from "@ordem/contracts";
import { recordMerchantPurchaseDelivery } from "@/server/campaign/merchant-purchases";
import { jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";
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
