import { requireSession } from "@/server/auth/session";
import { getCampaignSessionOptions } from "@/server/domain/campaign-sessions";
import { jsonResponse, withApiHandler } from "@/server/http";

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
