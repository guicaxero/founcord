import { GenerateCampaignSessionDraftSchema } from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import { generateCampaignSessionDraft } from "@/server/domain/campaign-sessions";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; sessionId: string }>;
}>;

export async function POST(request: Request, context: RouteContext) {
  const { campaignId, sessionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      await generateCampaignSessionDraft(
        await requireSession(request),
        campaignId,
        sessionId,
        await parseJson(request, GenerateCampaignSessionDraftSchema),
        correlationId,
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
