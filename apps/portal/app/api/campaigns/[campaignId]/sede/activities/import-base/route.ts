import { SedeImportResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { importBaseSedeActivities } from "@/server/sede/sede";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Importa as atividades do nível 1 do texto da campanha. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      SedeImportResponseSchema.parse(
        await importBaseSedeActivities(await requireSession(request), campaignId, correlationId),
      ),
      {},
      correlationId,
    );
  })(request);
}
