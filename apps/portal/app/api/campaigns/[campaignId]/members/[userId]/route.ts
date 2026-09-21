import { UpdateCampaignMemberSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { updateMember } from "@/server/campaign/campaigns";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; userId: string }>;
}>;

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId, userId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, UpdateCampaignMemberSchema);
    return jsonResponse(
      await updateMember(
        session,
        campaignId,
        userId,
        input,
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}
