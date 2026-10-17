import {
  capabilitiesForSession,
  getOptionalSession,
} from "@/server/identity/session";
import { diaryAccess } from "@/server/campaign/session-summaries";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ request, correlationId }) => {
  const session = await getOptionalSession(request);
  const diary = await diaryAccess(DEFAULT_CAMPAIGN_ID, session);
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
          diary,
        }
      : { authenticated: false, user: null, capabilities: [], assignments: [], diary },
    {},
    correlationId,
  );
});
