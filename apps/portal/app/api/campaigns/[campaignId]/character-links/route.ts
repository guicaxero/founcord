import { requireSession } from "@/server/identity/session";
import { listCampaignCharacterLinks } from "@/server/campaign/characters";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      await listCampaignCharacterLinks(await requireSession(request), campaignId),
      {},
      correlationId,
    ),
  )(request);
}
