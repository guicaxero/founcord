import { MerchantStockDrawSchema, MerchantStockSelectionInputSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { createStockSelection } from "@/server/merchant/stock-draws";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Estoque escolhido item a item; vira uma prévia enviada pelo mesmo fluxo do sorteio. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      MerchantStockDrawSchema.parse(
        await createStockSelection(
          await requireSession(request),
          campaignId,
          await parseJson(request, MerchantStockSelectionInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
