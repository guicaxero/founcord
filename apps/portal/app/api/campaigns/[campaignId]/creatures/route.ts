import { CreatureCreateInputSchema, CreatureListResponseSchema, CreatureSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { createCreature, listCreatures } from "@/server/creatures/library";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      CreatureListResponseSchema.parse({ data: await listCreatures(await requireSession(request), campaignId) }),
      {},
      correlationId,
    ),
  )(request);
}

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      CreatureSchema.parse(
        await createCreature(
          await requireSession(request),
          campaignId,
          await parseJson(request, CreatureCreateInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
