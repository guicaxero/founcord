import { CompendiumKindSchema, CompendiumListResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { listCompendium } from "@/server/creatures/compendium";
import { HttpError, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Resumo do bestiário (`?tipo=creature`) ou do grimório (`?tipo=spell`) importado. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    const kind = CompendiumKindSchema.safeParse(new URL(request.url).searchParams.get("tipo") ?? "creature");
    if (!kind.success) throw new HttpError(422, "validation_error", "Tipo de compêndio inválido.");
    return jsonResponse(
      CompendiumListResponseSchema.parse({
        data: await listCompendium(await requireSession(request), campaignId, kind.data),
      }),
      {},
      correlationId,
    );
  })(request);
}
