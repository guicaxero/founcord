import { PlayerCharacterSheetResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { getOwnCharacterSheet } from "@/server/campaign/character-sheet";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Ficha completa do personagem vinculado ao próprio usuário. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      PlayerCharacterSheetResponseSchema.parse(await getOwnCharacterSheet(await requireSession(request), campaignId)),
      {},
      correlationId,
    ),
  )(request);
}
