import {
  FoundryCharacterSyncResponseSchema,
  MerchantPurchaseDeliveryCallbackSchema,
  MerchantStockDeliveryCallbackSchema,
  type FoundryCharacterSyncCallback,
  type MerchantPurchaseDeliveryCallback,
  type MerchantStockDeliveryCallback,
} from "@ordem/contracts";
import type { FoundryEnv } from "./types";

export async function syncCharactersWithPortal(
  env: FoundryEnv,
  input: FoundryCharacterSyncCallback,
  correlationId: string,
) {
  const response = await env.PORTAL.fetch(
    new Request("https://portal.internal/api/internal/integration/foundry/characters/sync", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.INTEGRATION_SERVICE_TOKEN}`,
        "content-type": "application/json",
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify(input),
    }),
  );
  if (!response.ok) {
    throw new Error(`Portal character sync failed with ${response.status}.`);
  }
  return FoundryCharacterSyncResponseSchema.parse(await response.json());
}

export async function reportMerchantPurchaseDelivery(
  env: FoundryEnv,
  input: MerchantPurchaseDeliveryCallback,
  correlationId: string,
): Promise<void> {
  const body = MerchantPurchaseDeliveryCallbackSchema.parse(input);
  const response = await env.PORTAL.fetch(
    new Request("https://portal.internal/api/internal/integration/foundry/merchant-purchases/delivery", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.INTEGRATION_SERVICE_TOKEN}`,
        "content-type": "application/json",
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok) {
    throw new Error(`Portal merchant purchase callback failed with ${response.status}.`);
  }
}

/** Resultado da troca de estoque do Lojista no Foundry. */
export async function reportMerchantStockDelivery(
  env: FoundryEnv,
  input: MerchantStockDeliveryCallback,
  correlationId: string,
): Promise<void> {
  const body = MerchantStockDeliveryCallbackSchema.parse(input);
  const response = await env.PORTAL.fetch(
    new Request("https://portal.internal/api/internal/integration/foundry/merchant-stock/delivery", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.INTEGRATION_SERVICE_TOKEN}`,
        "content-type": "application/json",
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok) {
    throw new Error(`Portal merchant stock callback failed with ${response.status}.`);
  }
}
