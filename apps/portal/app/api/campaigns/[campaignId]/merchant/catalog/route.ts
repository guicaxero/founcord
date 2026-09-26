import {
  MerchantCatalogItemInputSchema,
  MerchantCatalogItemSchema,
  MerchantCatalogListResponseSchema,
} from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { createCatalogItem, listCatalog } from "@/server/merchant/catalog";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      MerchantCatalogListResponseSchema.parse({
        data: await listCatalog(await requireSession(request), campaignId),
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
      MerchantCatalogItemSchema.parse(
        await createCatalogItem(
          await requireSession(request),
          campaignId,
          await parseJson(request, MerchantCatalogItemInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
