import { CreateMissionSchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import { createMission, listMissions } from "@/server/campaign/missions";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    const url = new URL(request.url);
    return jsonResponse(
      {
        data: await listMissions(
          campaignId,
          await getOptionalSession(request),
          url.searchParams.get("scope") === "editorial",
        ),
        nextCursor: null,
      },
      {},
      correlationId,
    );
  })(request);
}

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const parsed = await parseJson(request, CreateMissionSchema);
    if (parsed.campaignId !== campaignId) {
      throw new HttpError(422, "campaign_mismatch", "A campanha informada é inválida.");
    }
    return jsonResponse(
      await createMission(session, parsed, correlationId),
      { status: 201 },
      correlationId,
    );
  })(request);
}
