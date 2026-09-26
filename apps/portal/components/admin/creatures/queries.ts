"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CompendiumEntry,
  CompendiumKind,
  CompendiumListResponse,
  Creature,
  CreatureDraftInput,
  CreatureListResponse,
  CreatureTargetListResponse,
} from "@ordem/contracts";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function useCreatures(campaignId: string) {
  return useQuery({
    queryKey: queryKeys.creatures(campaignId),
    queryFn: () => apiFetch<CreatureListResponse>(`/api/campaigns/${campaignId}/creatures`),
    // O módulo só aplica com o mestre no mundo; enquanto isso, consultamos devagar.
    refetchInterval: (query) =>
      query.state.data?.data.some((creature) => creature.status === "pending_delivery") ? 10_000 : false,
  });
}

export function useCompendium(campaignId: string, kind: CompendiumKind) {
  return useQuery({
    queryKey: queryKeys.compendium(campaignId, kind),
    queryFn: () => apiFetch<CompendiumListResponse>(`/api/campaigns/${campaignId}/compendium?tipo=${kind}`),
    staleTime: 5 * 60_000,
  });
}

export function useCreatureTargets(campaignId: string) {
  return useQuery({
    queryKey: queryKeys.creatureTargets(campaignId),
    queryFn: () => apiFetch<CreatureTargetListResponse>(`/api/campaigns/${campaignId}/creatures/targets`),
    staleTime: 30_000,
  });
}

export function fetchCompendiumEntry(campaignId: string, entryId: string) {
  return apiFetch<CompendiumEntry>(`/api/campaigns/${campaignId}/compendium/${entryId}`);
}

/** Cria uma criatura na biblioteca e devolve a nova ficha. */
export function useCreateCreature(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Readonly<{ draft: CreatureDraftInput; basedOnEntryId: string | null }>) =>
      apiFetch<Creature>(`/api/campaigns/${campaignId}/creatures`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (creature) => {
      queryClient.setQueryData(queryKeys.creatures(campaignId), (current: CreatureListResponse | undefined) =>
        current ? { data: [creature, ...current.data] } : current,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.creatures(campaignId) });
    },
  });
}
