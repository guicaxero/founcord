import { CreateAutomationJobSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import {
  listCampaignAutomations,
  requestCampaignAutomation,
} from "@/server/automation/jobs";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      await listCampaignAutomations(
        await requireSession(request),
        campaignId,
        correlationId,
      ),
      {},
      correlationId,
    ),
  )(request);
}

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const input = await parseJson(request, CreateAutomationJobSchema);
    if (input.campaignId !== campaignId) {
      throw new HttpError(422, "campaign_mismatch", "A campanha informada é inválida.");
    }
    const suppliedKey = request.headers.get("idempotency-key") ?? "";
    const idempotencyKey = /^[A-Za-z0-9:._-]{8,128}$/u.test(suppliedKey)
      ? suppliedKey
      : `portal:automation:${crypto.randomUUID()}`;
    return jsonResponse(
      await requestCampaignAutomation(
        await requireSession(request),
        input,
        idempotencyKey,
        correlationId,
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
