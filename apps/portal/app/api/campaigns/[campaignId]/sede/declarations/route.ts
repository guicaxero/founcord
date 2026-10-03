import { SedeDeclarationSchema, SedeDeclareInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { declareSedeActivity } from "@/server/sede/sede";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** O jogador escolhe uma atividade para o período atual. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      SedeDeclarationSchema.parse(
        await declareSedeActivity(
          await requireSession(request),
          campaignId,
          await parseJson(request, SedeDeclareInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
