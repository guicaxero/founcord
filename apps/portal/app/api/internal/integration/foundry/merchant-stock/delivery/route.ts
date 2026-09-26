import { MerchantStockDeliveryCallbackSchema, MerchantStockDrawSchema } from "@ordem/contracts";
import { recordStockDelivery } from "@/server/merchant/stock-draws";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";
import { jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

export const dynamic = "force-dynamic";

/** Resultado do módulo ao aplicar um sorteio de estoque, repassado pelo bridge. */
export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, MerchantStockDeliveryCallbackSchema);
  return jsonResponse(
    MerchantStockDrawSchema.parse(await recordStockDelivery(input, correlationId)),
    {},
    correlationId,
  );
});
