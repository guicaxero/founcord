import { MerchantCatalogItemSchema, MerchantCatalogItemUpdateSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { updateCatalogItem } from "@/server/merchant/catalog";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; itemId: string }> }>;

/** Edita ou (des)ativa um item. Itens nunca são apagados: o histórico de sorteios os referencia. */
export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId, itemId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      MerchantCatalogItemSchema.parse(
        await updateCatalogItem(
          await requireSession(request),
          campaignId,
          itemId,
          await parseJson(request, MerchantCatalogItemUpdateSchema),
          correlationId,
        ),
      ),
      {},
      correlationId,
    );
  })(request);
}
