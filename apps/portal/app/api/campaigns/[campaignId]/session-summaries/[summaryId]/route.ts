import { UpdateSessionSummarySchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import { deleteSessionSummary, updateSessionSummary } from "@/server/campaign/session-summaries";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; summaryId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId, summaryId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    const { listSessionSummaries } = await import("@/server/campaign/session-summaries");
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

export async function DELETE(request: Request, context: RouteContext) {
  const { campaignId, summaryId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!Number.isInteger(version) || version < 1) {
      return jsonResponse({ error: "invalid_version", message: "A versão do resumo é obrigatória." }, { status: 422 }, correlationId);
    }
    await deleteSessionSummary(await requireSession(request), campaignId, summaryId, version, correlationId);
    return new Response(null, { status: 204, headers: { "x-correlation-id": correlationId } });
  })(request);
}
