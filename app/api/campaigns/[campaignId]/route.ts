import { UpdateCampaignSchema } from "@vigilia/contracts";
import { getOptionalSession, requireSession } from "@/server/auth/session";
import { getCampaign, updateCampaign } from "@/server/domain/campaigns";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(_request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      await getCampaign(campaignId, await getOptionalSession(_request)),
      {},
      correlationId,
    ),
  )(_request);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, UpdateCampaignSchema);
    return jsonResponse(
      await updateCampaign(session, campaignId, input, correlationId),
      {},
      correlationId,
    );
  })(request);
}
