import { requireSession } from "@/server/auth/session";
import {
  listSignups,
  signupForMission,
  withdrawFromMission,
} from "@/server/domain/missions";
import {
  assertSameOrigin,
  jsonResponse,
  withApiHandler,
} from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ missionId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      { data: await listSignups(await requireSession(request), missionId) },
      {},
      correlationId,
    ),
  )(request);
}

export async function POST(request: Request, context: RouteContext) {
  const { missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      await signupForMission(
        await requireSession(request),
        missionId,
        correlationId,
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { missionId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    await withdrawFromMission(
      await requireSession(request),
      missionId,
      correlationId,
    );
    return new Response(null, { status: 204 });
  })(request);
}
