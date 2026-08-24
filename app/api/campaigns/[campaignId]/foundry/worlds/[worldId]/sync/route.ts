import { requireSession } from "@/server/auth/session";
import { requestFoundryCharacterSync } from "@/server/integrations/foundry-worlds";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/http";

type RouteContext = Readonly<{
  params: Promise<{ campaignId: string; worldId: string }>;
}>;

export async function POST(request: Request, context: RouteContext) {
  const { campaignId, worldId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      await requestFoundryCharacterSync(
        await requireSession(request),
        campaignId,
        worldId,
        correlationId,
      ),
      { status: 202 },
      correlationId,
    );
  })(request);
}
