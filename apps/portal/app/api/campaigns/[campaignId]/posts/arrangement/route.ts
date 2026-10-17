import { PostArrangementSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { arrangePosts } from "@/server/campaign/posts";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Ordem do arquivo público de crônicas (fixadas no topo) e tags de cada uma. */
export async function PUT(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, PostArrangementSchema);
    return jsonResponse({ data: await arrangePosts(session, campaignId, input, correlationId) }, {}, correlationId);
  })(request);
}
