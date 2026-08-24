import { CampaignSessionVersionSchema } from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import { startCampaignSession } from "@/server/domain/campaign-sessions";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/http";

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
