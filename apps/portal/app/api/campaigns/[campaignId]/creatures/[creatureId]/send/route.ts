import { CreatureSchema, CreatureSendInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { sendCreature } from "@/server/creatures/library";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; creatureId: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const { campaignId, creatureId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const input = await parseJson(request, CreatureSendInputSchema);
    return jsonResponse(
      CreatureSchema.parse(
        await sendCreature(await requireSession(request), campaignId, creatureId, input.worldId, correlationId),
      ),
      {},
      correlationId,
    );
  })(request);
}
