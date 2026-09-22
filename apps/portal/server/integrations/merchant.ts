import {
  FoundryMerchantPurchaseContextSchema,
  MerchantCatalogResponseSchema,
  type FoundryCommandCreateRequest,
  type FoundryMerchantPurchaseContext,
  type MerchantCatalogResponse,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import type { AuthenticatedSession } from "@/server/identity/session";
import { requireCampaignVisible } from "@/server/campaign/campaigns";
import { foundryRequest } from "./foundry-worlds";

export async function getMerchantCatalog(
  campaignId: string,
  session: AuthenticatedSession | null,
  correlationId: string,
): Promise<MerchantCatalogResponse> {
  await requireCampaignVisible(campaignId, session);
  if (session) {
    const link = await getD1()
      .prepare(
        `SELECT world_id FROM campaign_character_links
         WHERE campaign_id = ? AND user_id = ?`,
      )
      .bind(campaignId, session.user.id)
      .first<{ world_id: string }>();
    if (link) {
      const context = await getMerchantPurchaseContext(
        campaignId,
        link.world_id,
        correlationId,
      );
      return MerchantCatalogResponseSchema.parse({
        campaignId,
        connection: context.connection,
        catalog: context.catalog
          ? {
              merchantName: context.catalog.merchantName,
              syncedAt: context.catalog.syncedAt,
              freshness: context.connection.status === "offline"
                ? "offline"
                : Date.now() - Date.parse(context.catalog.syncedAt) > 15 * 60 * 1_000
                  ? "stale"
                  : "fresh",
              items: context.catalog.items,
            }
          : null,
      });
    }
  }
  return MerchantCatalogResponseSchema.parse(
    await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/merchant`,
      { method: "GET", correlationId },
    ),
  );
}

export async function getMerchantPurchaseContext(
  campaignId: string,
  worldId: string,
  correlationId: string,
): Promise<FoundryMerchantPurchaseContext> {
  return FoundryMerchantPurchaseContextSchema.parse(
    await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}/merchant/purchase-context`,
      { method: "GET", correlationId },
    ),
  );
}

export async function enqueueMerchantPurchaseRequest(
  campaignId: string,
  worldId: string,
  requestId: string,
  command: FoundryCommandCreateRequest,
  correlationId: string,
): Promise<Readonly<{ commandId: string; duplicate: boolean }>> {
  return (await foundryRequest(
    `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}/commands`,
    {
      method: "POST",
      correlationId,
      idempotencyKey: `portal:merchant-purchase:${requestId}`,
      body: command,
    },
  )) as Readonly<{ commandId: string; duplicate: boolean }>;
}
