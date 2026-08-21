import { UpdateCampaignMemberSchema } from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import { updateMember } from "@/server/domain/campaigns";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";

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
