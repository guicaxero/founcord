import { UpdateSessionSummarySchema } from "@vigilia/contracts";
import { getOptionalSession, requireSession } from "@/server/auth/session";
import { updateSessionSummary } from "@/server/domain/session-summaries";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; summaryId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId, summaryId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    const { listSessionSummaries } = await import("@/server/domain/session-summaries");
    const summary = (await listSessionSummaries(campaignId, await getOptionalSession(request), true)).find((item) => item.id === summaryId);
    if (!summary) return jsonResponse({ error: "session_summary_not_found", message: "Resumo de sessão não encontrado." }, { status: 404 }, correlationId);
    return jsonResponse(summary, {}, correlationId);
  })(request);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId, summaryId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, UpdateSessionSummarySchema);
    const summary = await updateSessionSummary(session, campaignId, summaryId, input, correlationId);
    return jsonResponse(summary, {}, correlationId);
  })(request);
}
