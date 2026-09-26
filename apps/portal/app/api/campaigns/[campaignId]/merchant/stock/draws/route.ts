import {
  MerchantStockCriteriaSchema,
  MerchantStockDrawListResponseSchema,
  MerchantStockDrawSchema,
} from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { createStockDraw, listStockDraws } from "@/server/merchant/stock-draws";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      MerchantStockDrawListResponseSchema.parse({
        data: await listStockDraws(await requireSession(request), campaignId),
      }),
      {},
      correlationId,
    ),
  )(request);
}

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      MerchantStockDrawSchema.parse(
        await createStockDraw(
          await requireSession(request),
          campaignId,
          await parseJson(request, MerchantStockCriteriaSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
