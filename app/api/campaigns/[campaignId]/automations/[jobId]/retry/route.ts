import { requireSession } from "@/server/auth/session";
import { retryCampaignAutomation } from "@/server/automations/jobs";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; jobId: string }>;
}>;

export async function POST(request: Request, context: RouteContext) {
  const { campaignId, jobId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      await retryCampaignAutomation(
        await requireSession(request),
        campaignId,
        jobId,
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}
