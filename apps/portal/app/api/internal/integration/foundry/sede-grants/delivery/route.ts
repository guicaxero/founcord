import { SedeDeclarationSchema, SedeGrantDeliveryCallbackSchema } from "@ordem/contracts";
import { recordSedeGrantDelivery } from "@/server/sede/sede";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";
import { jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

export const dynamic = "force-dynamic";

/** Resultado do módulo ao entregar os itens da Vida na Sede, repassado pelo bridge. */
export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, SedeGrantDeliveryCallbackSchema);
  return jsonResponse(
    SedeDeclarationSchema.parse(await recordSedeGrantDelivery(input, correlationId)),
    {},
    correlationId,
  );
});
