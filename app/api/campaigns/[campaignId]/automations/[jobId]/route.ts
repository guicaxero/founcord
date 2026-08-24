import { requireSession } from "@/server/auth/session";
import { cancelCampaignAutomation } from "@/server/automations/jobs";
import { assertSameOrigin, withApiHandler } from "@/server/http";

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
