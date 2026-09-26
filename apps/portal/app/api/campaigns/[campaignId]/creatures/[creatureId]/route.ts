import { CreatureSchema, CreatureUpdateInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { deleteCreature, getCreature, updateCreature } from "@/server/creatures/library";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; creatureId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId, creatureId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      CreatureSchema.parse(await getCreature(await requireSession(request), campaignId, creatureId)),
      {},
      correlationId,
    ),
  )(request);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId, creatureId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      CreatureSchema.parse(
        await updateCreature(
          await requireSession(request),
          campaignId,
          creatureId,
          await parseJson(request, CreatureUpdateInputSchema),
          correlationId,
        ),
      ),
      {},
      correlationId,
    );
  })(request);
}

/** Remove da biblioteca; o ator que já está no Foundry não é apagado. */
export async function DELETE(request: Request, context: RouteContext) {
  const { campaignId, creatureId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    await deleteCreature(await requireSession(request), campaignId, creatureId, correlationId);
    return jsonResponse({ deleted: true }, {}, correlationId);
  })(request);
}
