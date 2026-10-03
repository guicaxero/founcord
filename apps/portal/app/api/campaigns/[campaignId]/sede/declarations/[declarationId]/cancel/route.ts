import { SedeDeclarationSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { cancelSedeDeclaration } from "@/server/sede/sede";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; declarationId: string }> }>;

/** Desfaz uma atividade ainda não resolvida. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId, declarationId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      SedeDeclarationSchema.parse(
        await cancelSedeDeclaration(await requireSession(request), campaignId, declarationId, correlationId),
      ),
      {},
      correlationId,
    );
  })(request);
}
