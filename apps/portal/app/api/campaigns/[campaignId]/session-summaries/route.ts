import { CreateSessionSummarySchema, SessionSummaryListResponseSchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import { createSessionSummary, listSessionSummaries } from "@/server/campaign/session-summaries";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      SessionSummaryListResponseSchema.parse({
        data: await listSessionSummaries(
          campaignId,
          await getOptionalSession(request),
          new URL(request.url).searchParams.get("scope") === "editorial",
        ),
      }),
      {},
      correlationId,
    ),
  )(request);
}

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, CreateSessionSummarySchema);
    if (input.campaignId !== campaignId) {
      return jsonResponse({ error: "campaign_mismatch", message: "A campanha informada é inválida." }, { status: 422 }, correlationId);
    }
    return jsonResponse(await createSessionSummary(session, input, correlationId), { status: 201 }, correlationId);
  })(request);
}
