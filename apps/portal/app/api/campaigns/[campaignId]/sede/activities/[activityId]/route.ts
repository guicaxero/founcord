import { SedeActivitySchema, SedeActivityUpdateSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { updateSedeActivity } from "@/server/sede/sede";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; activityId: string }> }>;

/** Edita ou (des)ativa uma atividade. Atividades não são apagadas: o histórico as referencia. */
export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId, activityId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      SedeActivitySchema.parse(
        await updateSedeActivity(
          await requireSession(request),
          campaignId,
          activityId,
          await parseJson(request, SedeActivityUpdateSchema),
          correlationId,
        ),
      ),
      {},
      correlationId,
    );
  })(request);
}
