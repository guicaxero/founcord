import { MerchantCatalogImportResponseSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { importBaseCatalog } from "@/server/merchant/catalog";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      MerchantCatalogImportResponseSchema.parse(
        await importBaseCatalog(await requireSession(request), campaignId, correlationId),
      ),
      {},
      correlationId,
    );
  })(request);
}
