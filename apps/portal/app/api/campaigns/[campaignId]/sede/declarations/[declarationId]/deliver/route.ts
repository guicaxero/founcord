import { SedeDeclarationSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { retrySedeDelivery } from "@/server/sede/sede";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; declarationId: string }> }>;

/** Reenvia ao Foundry os itens de uma atividade cuja entrega falhou. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId, declarationId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      SedeDeclarationSchema.parse(
        await retrySedeDelivery(await requireSession(request), campaignId, declarationId, correlationId),
      ),
      {},
      correlationId,
    );
  })(request);
}
