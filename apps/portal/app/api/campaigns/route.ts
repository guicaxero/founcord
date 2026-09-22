import { CreateCampaignSchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import { createCampaign, listCampaigns } from "@/server/campaign/campaigns";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ request, correlationId }) =>
  jsonResponse(
    { data: await listCampaigns(await getOptionalSession(request)) },
    {},
    correlationId,
  ),
);

export const POST = withApiHandler(async ({ request, correlationId }) => {
  assertSameOrigin(request);
  const session = await requireSession(request);
  const input = await parseJson(request, CreateCampaignSchema);
  return jsonResponse(
    await createCampaign(session, input, correlationId),
    { status: 201 },
    correlationId,
  );
});
