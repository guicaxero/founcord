import { requireSession } from "@/server/auth/session";
import { listCampaignCharacterLinks } from "@/server/domain/characters";
import { jsonResponse, withApiHandler } from "@/server/http";

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
