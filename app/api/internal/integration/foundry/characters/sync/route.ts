import {
  FoundryCharacterSyncCallbackSchema,
  FoundryCharacterSyncResponseSchema,
} from "@vigilia/contracts";
import { jsonResponse, parseJson, withApiHandler } from "@/server/http";
import { recordFoundryCharacterSync } from "@/server/integrations/foundry-characters";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, FoundryCharacterSyncCallbackSchema);
  const result = await recordFoundryCharacterSync(input, correlationId);
  return jsonResponse(
    FoundryCharacterSyncResponseSchema.parse(result),
    {},
    correlationId,
  );
});
