import { clearCookie } from "@/server/identity/cookies";
import { destroySession, getOptionalSession } from "@/server/identity/session";
import { SESSION_COOKIE } from "@/server/shared/constants";
import { getD1 } from "@/server/shared/db";
import { prepareAudit } from "@/server/shared/audit";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/shared/http";

export const POST = withApiHandler(async ({ request, correlationId }) => {
  assertSameOrigin(request);
  const session = await getOptionalSession(request);
  await destroySession(request);
  if (session) {
    await prepareAudit(getD1(), {
      actorUserId: session.user.id,
      campaignId: null,
      action: "auth.logout",
      entityType: "user",
      entityId: session.user.id,
      correlationId,
    }).run();
  }
  return jsonResponse(
    { ok: true },
    { headers: { "set-cookie": clearCookie(request, SESSION_COOKIE) } },
    correlationId,
  );
});
