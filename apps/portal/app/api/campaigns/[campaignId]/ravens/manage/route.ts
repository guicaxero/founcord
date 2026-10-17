import { requireSession } from "@/server/identity/session";
import { listRavenManagement } from "@/server/campaign/ravens";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Todos os Corvos com correções e valores automáticos, para o painel. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(await listRavenManagement(await requireSession(request), campaignId), {}, correlationId),
  )(request);
}
