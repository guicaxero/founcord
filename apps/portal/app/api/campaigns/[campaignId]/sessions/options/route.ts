import { requireSession } from "@/server/identity/session";
import { getCampaignSessionOptions } from "@/server/campaign/campaign-sessions";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      await getCampaignSessionOptions(
        await requireSession(request),
        campaignId,
        correlationId,
      ),
      {},
      correlationId,
    ),
  )(request);
}
