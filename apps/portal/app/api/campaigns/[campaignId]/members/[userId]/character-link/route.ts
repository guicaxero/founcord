import { CampaignCharacterLinkInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import {
  removeCampaignCharacterLink,
  saveCampaignCharacterLink,
} from "@/server/campaign/characters";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; userId: string }>;
}>;

export async function PUT(request: Request, context: RouteContext) {
  const { campaignId, userId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const input = await parseJson(request, CampaignCharacterLinkInputSchema);
    return jsonResponse(
      await saveCampaignCharacterLink(
        await requireSession(request),
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
export async function DELETE(request: Request, context: RouteContext) {
  const { campaignId, userId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      await removeCampaignCharacterLink(
        await requireSession(request),
        campaignId,
        userId,
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}
