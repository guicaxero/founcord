import { UpdateRavenSchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import { getRaven, updateRaven } from "@/server/campaign/ravens";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ ravenId: string }> }>;

/** Ficha pública do Corvo. */
export async function GET(request: Request, context: RouteContext) {
  const { ravenId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(await getRaven(ravenId, await getOptionalSession(request)), {}, correlationId),
  )(request);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { ravenId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, UpdateRavenSchema);
    return jsonResponse(await updateRaven(session, ravenId, input, correlationId), {}, correlationId);
  })(request);
}
