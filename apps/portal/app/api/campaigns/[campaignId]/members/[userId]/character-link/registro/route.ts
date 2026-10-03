import { CampaignCharacterLinkSchema, CharacterRegistroInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { setCampaignCharacterRegistro } from "@/server/campaign/characters";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; userId: string }> }>;

/** Liga (ou remove) o tópico do Corvo no Registro do Corvo do Discord. */
export async function PUT(request: Request, context: RouteContext) {
  const { campaignId, userId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      CampaignCharacterLinkSchema.parse(
        await setCampaignCharacterRegistro(
          await requireSession(request),
          campaignId,
          userId,
          await parseJson(request, CharacterRegistroInputSchema),
          correlationId,
        ),
      ),
      {},
      correlationId,
    );
  })(request);
}
