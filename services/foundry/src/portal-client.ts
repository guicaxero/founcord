import {
  FoundryCharacterSyncResponseSchema,
  type FoundryCharacterSyncCallback,
} from "@vigilia/contracts";
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
