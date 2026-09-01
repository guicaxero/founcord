import {
  MerchantCatalogResponseSchema,
  type MerchantCatalogResponse,
} from "@vigilia/contracts";
import type { AuthenticatedSession } from "@/server/auth/session";
import { requireCampaignVisible } from "@/server/domain/campaigns";
import { foundryRequest } from "./foundry-worlds";

export async function getMerchantCatalog(
  campaignId: string,
  session: AuthenticatedSession | null,
  correlationId: string,
): Promise<MerchantCatalogResponse> {
  await requireCampaignVisible(campaignId, session);
  return MerchantCatalogResponseSchema.parse(
    await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/merchant`,
      { method: "GET", correlationId },
    ),
  );
}
