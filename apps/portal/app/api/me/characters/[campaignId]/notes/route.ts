import { CharacterNotesUpdateInputSchema, CharacterNotesUpdateSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { updateOwnCharacterNotes } from "@/server/campaign/character-sheet";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Envia ao Foundry as anotações do personagem vinculado ao próprio usuário. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      CharacterNotesUpdateSchema.parse(
        await updateOwnCharacterNotes(
          await requireSession(request),
          campaignId,
          await parseJson(request, CharacterNotesUpdateInputSchema),
          correlationId,
        ),
      ),
      { status: 202 },
      correlationId,
    );
  })(request);
}
