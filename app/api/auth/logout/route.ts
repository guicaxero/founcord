import { clearCookie } from "@/server/auth/cookies";
import { destroySession, getOptionalSession } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/constants";
import { getD1 } from "@/db";
import { prepareAudit } from "@/server/audit";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/http";

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
