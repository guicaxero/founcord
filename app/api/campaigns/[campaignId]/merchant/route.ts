import { MerchantCatalogResponseSchema } from "@vigilia/contracts";
import { getOptionalSession } from "@/server/auth/session";
import { jsonResponse, withApiHandler } from "@/server/http";
import { getMerchantCatalog } from "@/server/integrations/merchant";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      MerchantCatalogResponseSchema.parse(
        await getMerchantCatalog(
          campaignId,
          await getOptionalSession(request),
          correlationId,
        ),
      ),
      {},
      correlationId,
    ),
  )(request);
}
