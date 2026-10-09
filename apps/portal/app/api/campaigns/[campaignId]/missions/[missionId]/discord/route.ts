import { MissionDiscordPublishInputSchema, MissionDiscordViewSchema } from "@ordem/contracts";
import { getMissionDiscordView, publishMissionToDiscord } from "@/server/campaign/mission-discord";
import { requireSession } from "@/server/identity/session";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; missionId: string }> }>;

/** Fóruns do Discord e as tags do escolhido (`?forumId=`), para publicar a missão. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId, missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    const forumId = new URL(request.url).searchParams.get("forumId");
    return jsonResponse(
      MissionDiscordViewSchema.parse(
        await getMissionDiscordView(await requireSession(request), campaignId, missionId, forumId, correlationId),
      ),
      {},
      correlationId,
    );
  })(request);
}

/** Cria o tópico da missão no fórum do Discord, com a capa e as tags. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId, missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      await publishMissionToDiscord(
        await requireSession(request),
        campaignId,
        missionId,
        await parseJson(request, MissionDiscordPublishInputSchema),
        correlationId,
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
