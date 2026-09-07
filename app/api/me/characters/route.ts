import { requireSession } from "@/server/auth/session";
import { listMyCharacters } from "@/server/domain/characters";
import { jsonResponse, withApiHandler } from "@/server/http";

export async function GET(request: Request) {
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      await listMyCharacters(await requireSession(request)),
      {},
      correlationId,
    ),
  )(request);
}
