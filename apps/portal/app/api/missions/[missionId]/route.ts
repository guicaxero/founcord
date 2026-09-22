import { UpdateMissionSchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import {
  archiveMission,
  getMission,
  updateMission,
} from "@/server/campaign/missions";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ missionId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      await getMission(missionId, await getOptionalSession(request)),
      {},
      correlationId,
    ),
  )(request);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, UpdateMissionSchema);
    return jsonResponse(
      await updateMission(
        session,
        missionId,
        input,
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!Number.isInteger(version) || version < 1) {
      throw new HttpError(422, "invalid_version", "Informe a versão da missão.");
    }
    await archiveMission(
      await requireSession(request),
      missionId,
      version,
      correlationId,
    );
    return new Response(null, { status: 204 });
  })(request);
}
