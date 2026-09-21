import { requireSession } from "@/server/identity/session";
import { listMyCharacters } from "@/server/campaign/characters";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

export async function GET(request: Request) {
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      await listMyCharacters(await requireSession(request)),
      {},
      correlationId,
    ),
  )(request);
}
