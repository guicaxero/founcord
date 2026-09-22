import { requireSession } from "@/server/identity/session";
import { retryCampaignAutomation } from "@/server/automation/jobs";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/shared/http";

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
