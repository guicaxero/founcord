import { UpdateProfileSchema } from "@ordem/contracts";
import { updateProfile } from "@/server/identity/profile";
import { requireSession } from "@/server/identity/session";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

/** Nome no portal da pessoa logada. */
export const PATCH = withApiHandler(async ({ request, correlationId }) => {
  assertSameOrigin(request);
  const session = await requireSession(request);
  const input = await parseJson(request, UpdateProfileSchema);
  return jsonResponse(await updateProfile(session, input), {}, correlationId);
});
