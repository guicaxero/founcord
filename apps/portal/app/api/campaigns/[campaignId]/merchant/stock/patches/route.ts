import { MerchantStockPatchInputSchema, MerchantStockPatchSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { createStockPatch } from "@/server/merchant/stock-patches";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Envia ao Foundry só as mudanças feitas no estoque atual do Lojista. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      MerchantStockPatchSchema.parse(
        await createStockPatch(
          await requireSession(request),
          campaignId,
          await parseJson(request, MerchantStockPatchInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
