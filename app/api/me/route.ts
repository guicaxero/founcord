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
        }
      : { authenticated: false, user: null, capabilities: [] },
    {},
    correlationId,
  );
});
