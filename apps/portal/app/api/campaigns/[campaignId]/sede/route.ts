import { SedeStateResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { getSedeState } from "@/server/sede/sede";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Vida na Sede do próprio jogador: período, atividades disponíveis e histórico. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      SedeStateResponseSchema.parse(await getSedeState(await requireSession(request), campaignId)),
      {},
      correlationId,
    ),
  )(request);
}
