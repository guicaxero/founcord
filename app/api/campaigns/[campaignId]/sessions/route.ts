import { CreateCampaignSessionSchema } from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import {
  createCampaignSession,
  listCampaignSessions,
} from "@/server/domain/campaign-sessions";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      { data: await listCampaignSessions(await requireSession(request), campaignId, correlationId) },
      {},
      correlationId,
    ),
  )(request);
}

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const input = await parseJson(request, CreateCampaignSessionSchema);
    if (input.campaignId !== campaignId) {
      throw new HttpError(422, "campaign_mismatch", "A campanha informada é inválida.");
    }
    return jsonResponse(
      await createCampaignSession(await requireSession(request), input, correlationId),
      { status: 201 },
      correlationId,
    );
  })(request);
}
