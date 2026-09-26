import { CreatureDeliveryCallbackSchema, CreatureSchema } from "@ordem/contracts";
import { recordCreatureDelivery } from "@/server/creatures/library";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";
import { jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

export const dynamic = "force-dynamic";

/** Resultado do módulo ao criar ou atualizar o ator da criatura, repassado pelo bridge. */
export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, CreatureDeliveryCallbackSchema);
  return jsonResponse(
    CreatureSchema.parse(await recordCreatureDelivery(input, correlationId)),
    {},
    correlationId,
  );
});
