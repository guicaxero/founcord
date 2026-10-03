import { SedeManageResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { getSedeManagement } from "@/server/sede/sede";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Painel do Guardião: nível da Sede, atividades, pendentes e resolvidas. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      SedeManageResponseSchema.parse(await getSedeManagement(await requireSession(request), campaignId)),
      {},
      correlationId,
    ),
  )(request);
}
