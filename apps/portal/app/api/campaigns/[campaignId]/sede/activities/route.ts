import { SedeActivityInputSchema, SedeActivitySchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { createSedeActivity } from "@/server/sede/sede";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      SedeActivitySchema.parse(
        await createSedeActivity(
          await requireSession(request),
          campaignId,
          await parseJson(request, SedeActivityInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
