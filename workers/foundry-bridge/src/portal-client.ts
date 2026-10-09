import {
  CharacterNotesDeliveryCallbackSchema,
  SedeGrantDeliveryCallbackSchema,
  CreatureDeliveryCallbackSchema,
  FoundryCharacterSyncResponseSchema,
  MerchantPurchaseDeliveryCallbackSchema,
  MerchantStockDeliveryCallbackSchema,
  MerchantStockPatchDeliveryCallbackSchema,
  type FoundryCharacterSyncCallback,
  type MerchantPurchaseDeliveryCallback,
  type MerchantStockDeliveryCallback,
  type MerchantStockPatchDeliveryCallback,
  type CharacterNotesDeliveryCallback,
  type SedeGrantDeliveryCallback,
  type CreatureDeliveryCallback,
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

/** Resultado de uma edição do estoque do Lojista, item a item. */
export async function reportMerchantStockPatchDelivery(
  env: FoundryEnv,
  input: MerchantStockPatchDeliveryCallback,
  correlationId: string,
): Promise<void> {
  const body = MerchantStockPatchDeliveryCallbackSchema.parse(input);
  const response = await env.PORTAL.fetch(
    new Request("https://portal.internal/api/internal/integration/foundry/merchant-stock/patch-delivery", {
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
    throw new Error(`Portal merchant stock patch callback failed with ${response.status}.`);
  }
}

/** Resultado da criação ou atualização do ator de uma criatura no Foundry. */
export async function reportCreatureDelivery(
  env: FoundryEnv,
  input: CreatureDeliveryCallback,
  correlationId: string,
): Promise<void> {
  const body = CreatureDeliveryCallbackSchema.parse(input);
  const response = await env.PORTAL.fetch(
    new Request("https://portal.internal/api/internal/integration/foundry/creatures/delivery", {
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
    throw new Error(`Portal creature callback failed with ${response.status}.`);
  }
}

/** Resultado da gravação das anotações do personagem no Foundry. */
export async function reportCharacterNotesDelivery(
  env: FoundryEnv,
  input: CharacterNotesDeliveryCallback,
  correlationId: string,
): Promise<void> {
  const body = CharacterNotesDeliveryCallbackSchema.parse(input);
  const response = await env.PORTAL.fetch(
    new Request("https://portal.internal/api/internal/integration/foundry/character-notes/delivery", {
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
    throw new Error(`Portal character notes callback failed with ${response.status}.`);
  }
}

/** Resultado da entrega dos itens da Vida na Sede no personagem. */
export async function reportSedeGrantDelivery(
  env: FoundryEnv,
  input: SedeGrantDeliveryCallback,
  correlationId: string,
): Promise<void> {
  const body = SedeGrantDeliveryCallbackSchema.parse(input);
  const response = await env.PORTAL.fetch(
    new Request("https://portal.internal/api/internal/integration/foundry/sede-grants/delivery", {
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
    throw new Error(`Portal sede grant callback failed with ${response.status}.`);
  }
}
