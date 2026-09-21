import { requireSession } from "@/server/identity/session";
import { disconnectFoundryWorld } from "@/server/integrations/foundry-worlds";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; worldId: string }>;
}>;

export async function DELETE(request: Request, context: RouteContext) {
  const { campaignId, worldId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      await disconnectFoundryWorld(
        await requireSession(request),
        campaignId,
        worldId,
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}
