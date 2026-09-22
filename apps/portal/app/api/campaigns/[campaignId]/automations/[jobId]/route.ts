import { requireSession } from "@/server/identity/session";
import { cancelCampaignAutomation } from "@/server/automation/jobs";
import { assertSameOrigin, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; jobId: string }>;
}>;

export async function DELETE(request: Request, context: RouteContext) {
  const { campaignId, jobId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    await cancelCampaignAutomation(
      await requireSession(request),
      campaignId,
      jobId,
      correlationId,
    );
    return new Response(null, {
      status: 204,
      headers: { "x-correlation-id": correlationId },
    });
  })(request);
}
