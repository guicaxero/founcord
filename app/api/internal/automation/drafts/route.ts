import {
  AutomationDraftCallbackResponseSchema,
  AutomationDraftCallbackSchema,
} from "@vigilia/contracts";
import { createAutomationDraft } from "@/server/automations/drafts";
import { jsonResponse, parseJson, withApiHandler } from "@/server/http";
import { assertAutomationServiceRequest } from "@/server/integrations/service-auth";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertAutomationServiceRequest(request);
  const input = await parseJson(request, AutomationDraftCallbackSchema);
  return jsonResponse(
    AutomationDraftCallbackResponseSchema.parse(
      await createAutomationDraft(input, correlationId),
    ),
    { status: 201 },
    correlationId,
  );
});
