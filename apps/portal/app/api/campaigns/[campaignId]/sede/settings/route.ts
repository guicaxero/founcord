import { SedeSettingsInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { setSedeLevel } from "@/server/sede/sede";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Define o nível da Sede, que limita as atividades por período. */
export async function PUT(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const input = await parseJson(request, SedeSettingsInputSchema);
    return jsonResponse(
      { level: await setSedeLevel(await requireSession(request), campaignId, input.level, correlationId) },
      {},
      correlationId,
    );
  })(request);
}
