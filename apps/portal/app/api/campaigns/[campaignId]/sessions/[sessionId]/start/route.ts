import { CampaignSessionVersionSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { startCampaignSession } from "@/server/campaign/campaign-sessions";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; sessionId: string }>;
}>;

export async function POST(request: Request, context: RouteContext) {
  const { campaignId, sessionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const input = await parseJson(request, CampaignSessionVersionSchema);
    return jsonResponse(
      await startCampaignSession(
        await requireSession(request),
        campaignId,
        sessionId,
        input.version,
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}
