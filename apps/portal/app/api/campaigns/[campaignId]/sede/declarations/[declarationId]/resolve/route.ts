import { SedeDeclarationSchema, SedeResolveInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { resolveSedeDeclaration } from "@/server/sede/sede";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; declarationId: string }> }>;

/** O Guardião registra (ou corrige) o resultado da atividade. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId, declarationId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      SedeDeclarationSchema.parse(
        await resolveSedeDeclaration(
          await requireSession(request),
          campaignId,
          declarationId,
          await parseJson(request, SedeResolveInputSchema),
          correlationId,
        ),
      ),
      {},
      correlationId,
    );
  })(request);
}
