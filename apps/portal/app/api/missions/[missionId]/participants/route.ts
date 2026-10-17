import { MissionParticipantsInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { getMission } from "@/server/campaign/missions";
import { setMissionParticipants } from "@/server/campaign/ravens";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ missionId: string }> }>;

/** Troca a lista de Corvos que participaram da missão. */
export async function PUT(request: Request, context: RouteContext) {
  const { missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, MissionParticipantsInputSchema);
    await setMissionParticipants(session, missionId, input.ravenIds, correlationId);
    return jsonResponse(await getMission(missionId, session), {}, correlationId);
  })(request);
}
