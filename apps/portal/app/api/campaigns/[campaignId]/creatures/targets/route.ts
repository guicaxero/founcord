import { CreatureTargetListResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { listCreatureTargets } from "@/server/creatures/library";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      CreatureTargetListResponseSchema.parse({
        data: await listCreatureTargets(await requireSession(request), campaignId, correlationId),
      }),
      {},
      correlationId,
    ),
  )(request);
}
