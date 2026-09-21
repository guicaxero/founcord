import { UpdateCampaignSessionSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import {
  getCampaignSession,
  updateCampaignSession,
} from "@/server/campaign/campaign-sessions";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; sessionId: string }>;
}>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId, sessionId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      await getCampaignSession(
        await requireSession(request),
        campaignId,
        sessionId,
        correlationId,
      ),
      {},
      correlationId,
    ),
  )(request);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId, sessionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      await updateCampaignSession(
        await requireSession(request),
        campaignId,
        sessionId,
        await parseJson(request, UpdateCampaignSessionSchema),
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}
