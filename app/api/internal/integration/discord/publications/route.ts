import { DiscordPostPublishedNotificationSchema } from "@vigilia/contracts";
import {
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";
import { recordDiscordPublication } from "@/server/integrations/discord-publications";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, DiscordPostPublishedNotificationSchema);
  await recordDiscordPublication(input, correlationId);
  return jsonResponse({ ok: true }, {}, correlationId);
});
