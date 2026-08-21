import {
  capabilitiesForSession,
  getOptionalSession,
} from "@/server/auth/session";
import { jsonResponse, withApiHandler } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ request, correlationId }) => {
  const session = await getOptionalSession(request);
  return jsonResponse(
    session
      ? {
          authenticated: true,
          user: session.user,
          capabilities: capabilitiesForSession(session),
          assignments: session.assignments.map((assignment) => ({
            roleName: assignment.roleName,
            scopeKind: assignment.scope.kind,
            scopeId:
              assignment.scope.kind === "global"
                ? "*"
                : assignment.scope.campaignId,
          })),
        }
      : { authenticated: false, user: null, capabilities: [], assignments: [] },
    {},
    correlationId,
  );
});
