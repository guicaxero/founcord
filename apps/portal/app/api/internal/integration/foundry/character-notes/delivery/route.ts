import { CharacterNotesDeliveryCallbackSchema, CharacterNotesUpdateSchema } from "@ordem/contracts";
import { recordCharacterNotesDelivery } from "@/server/campaign/character-sheet";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";
import { jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

export const dynamic = "force-dynamic";

/** Resultado do módulo ao gravar as anotações do personagem, repassado pelo bridge. */
export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, CharacterNotesDeliveryCallbackSchema);
  return jsonResponse(
    CharacterNotesUpdateSchema.parse(await recordCharacterNotesDelivery(input, correlationId)),
    {},
    correlationId,
  );
});
