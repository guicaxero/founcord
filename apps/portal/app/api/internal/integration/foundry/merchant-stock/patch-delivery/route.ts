import { MerchantStockPatchDeliveryCallbackSchema, MerchantStockPatchSchema } from "@ordem/contracts";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";
import { recordStockPatchDelivery } from "@/server/merchant/stock-patches";
import { jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

export const dynamic = "force-dynamic";

/** Resultado do módulo ao aplicar uma edição do estoque, repassado pelo bridge. */
export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, MerchantStockPatchDeliveryCallbackSchema);
  return jsonResponse(
    MerchantStockPatchSchema.parse(await recordStockPatchDelivery(input, correlationId)),
    {},
    correlationId,
  );
});
