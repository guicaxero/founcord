import {
  MerchantPurchaseListResponseSchema,
  MerchantPurchaseRequestInputSchema,
  MerchantPurchaseRequestSchema,
} from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import {
  createMerchantPurchase,
  listMerchantPurchases,
} from "@/server/domain/merchant-purchases";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  const ownOnly = new URL(request.url).searchParams.get("scope") === "self";
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      MerchantPurchaseListResponseSchema.parse({
        data: await listMerchantPurchases(
          await requireSession(request),
          campaignId,
          ownOnly,
        ),
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
      MerchantPurchaseRequestSchema.parse(
        await createMerchantPurchase(
          await requireSession(request),
          campaignId,
          await parseJson(request, MerchantPurchaseRequestInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
