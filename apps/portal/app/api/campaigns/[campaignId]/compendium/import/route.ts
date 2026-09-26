import { CompendiumImportInputSchema, CompendiumImportResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { importCompendium } from "@/server/creatures/compendium";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Importa um lote (até 30 arquivos) de exports do Foundry escolhidos pelo mestre. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      CompendiumImportResponseSchema.parse(
        await importCompendium(
          await requireSession(request),
          campaignId,
          await parseJson(request, CompendiumImportInputSchema),
          correlationId,
        ),
      ),
      {},
      correlationId,
    );
  })(request);
}
