"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  CurrentUserResponse,
  MerchantCatalogResponse,
  MerchantPurchaseListResponse,
  MerchantPurchaseRequest,
  PlayerCharacterListResponse,
} from "@ordem/contracts";
import { useState } from "react";
import { MerchantPurchasesPanel } from "@/components/admin/merchant-purchases-panel";
import { MerchantCatalog } from "@/components/merchant/merchant-catalog";
import { queryKeys } from "@/lib/query-keys";

const campaignId = "11111111-1111-4111-8111-111111111111";
const worldId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

const me: CurrentUserResponse = {
  authenticated: true,
  user: {
    id: userId,
    discordUserId: "preview-merchant-player",
    displayName: "Alaric da Cinza",
    avatarUrl: null,
  },
  capabilities: [
    { permission: "merchant:purchase:request", scopeKind: "campaign", scopeId: campaignId },
    { permission: "merchant:purchase:manage", scopeKind: "campaign", scopeId: campaignId },
  ],
  assignments: [{ roleName: "campaign_manager", scopeKind: "campaign", scopeId: campaignId }],
};

const characters: PlayerCharacterListResponse = {
  data: [{
    campaign: { id: campaignId, name: "Ordem da Última Luz" },
    link: {
      id: "44444444-4444-4444-8444-444444444444",
      campaignId,
      userId,
      worldId,
      actorId: "alaric-001",
      actorName: "Alaric, Portador da Cinza",
      createdAt: "2026-09-07T15:02:00.000Z",
      updatedAt: "2026-09-07T15:02:00.000Z",
      character: {
        worldId,
        actorId: "alaric-001",
        name: "Alaric, Portador da Cinza",
        level: 4,
        ancestry: "Humano",
        paths: { novice: "Sacerdote", expert: "Oráculo", master: null, legendary: null },
        statistics: { healthMax: 24, damage: 6, healingRate: 6, insanity: 2, corruption: 1 },
        wealth: { gc: 0, ss: 1, cp: 0, bits: 0 },
        sourceUpdatedAt: "2026-09-07T15:00:00.000Z",
        lastSyncedAt: "2026-09-07T15:01:00.000Z",
        active: true,
      },
    },
  }],
};

const catalog: MerchantCatalogResponse = {
  campaignId,
  connection: { status: "online", lastSeenAt: "2026-09-07T15:04:00.000Z" },
  catalog: {
    merchantName: "Madame Varda, a Intendente",
    syncedAt: "2026-09-07T15:03:00.000Z",
    freshness: "fresh",
    items: [
      {
        itemId: "pocao-cura-menor",
        name: "Poção de cura menor",
        description: "Um frasco de vidro escuro que restaura o fôlego de aventureiros feridos.",
        category: "Poções",
        imageUrl: null,
        price: "5 xp",
        quantity: 7,
        sourceUpdatedAt: "2026-09-07T15:00:00.000Z",
      },
      {
        itemId: "bomba-fumaca",
        name: "Bomba de fumaça",
        description: "Cerâmica selada com reagentes que liberam uma nuvem densa ao impacto.",
        category: "Alquimia",
        imageUrl: null,
        price: "8 cp",
        quantity: 3,
        sourceUpdatedAt: "2026-09-07T15:00:00.000Z",
      },
      {
        itemId: "lanterna-furta-fogo",
        name: "Lanterna furta-fogo",
        description: "Lanterna de latão com obturador para ocultar a chama durante rondas noturnas.",
        category: "Equipamento",
        imageUrl: null,
        price: "1 gc 5 ss",
        quantity: 2,
        sourceUpdatedAt: "2026-09-07T15:00:00.000Z",
      },
      {
        itemId: "corda-canhamo",
        name: "Corda de cânhamo (15 m)",
        description: "Corda resistente, trançada à mão, esgotada até a próxima caravana.",
        category: "Equipamento",
        imageUrl: null,
        price: "5 cp",
        quantity: 0,
        sourceUpdatedAt: "2026-09-07T15:00:00.000Z",
      },
      {
        itemId: "lamina-prata",
        name: "Lâmina de prata consagrada",
        description: "Uma lâmina curta reservada para ameaças que não temem o aço comum.",
        category: "Armas",
        imageUrl: null,
        price: "2 gc e um favor",
        quantity: 1,
        sourceUpdatedAt: "2026-09-07T15:00:00.000Z",
      },
    ],
  },
};

const purchaseBase: Omit<MerchantPurchaseRequest, "id" | "status" | "deliveryError" | "resolutionNote" | "resolvedByName" | "resolvedAt" | "updatedAt"> = {
  campaignId,
  requester: { userId, displayName: "Alaric da Cinza" },
  character: { actorName: "Alaric, Portador da Cinza" },
  item: { itemId: "pocao-cura-menor", name: "Poção de cura menor", price: "5 xp", quantity: 2 },
  note: "Se possível, separar antes da expedição de sábado.",
  createdAt: "2026-09-07T15:05:00.000Z",
};

const purchases: MerchantPurchaseListResponse = {
  data: [
    {
      ...purchaseBase,
      id: "55555555-5555-4555-8555-555555555555",
      status: "awaiting_master",
      deliveryError: null,
      resolutionNote: null,
      resolvedByName: null,
      resolvedAt: null,
      updatedAt: "2026-09-07T15:05:30.000Z",
    },
    {
      ...purchaseBase,
      id: "66666666-6666-4666-8666-666666666666",
      item: { itemId: "bomba-fumaca", name: "Bomba de fumaça", price: "8 cp", quantity: 1 },
      note: null,
      status: "fulfilled",
      deliveryError: null,
      resolutionNote: "Item entregue e moedas ajustadas na ficha.",
      resolvedByName: "Guardião da Chama",
      resolvedAt: "2026-09-06T20:20:00.000Z",
      createdAt: "2026-09-06T20:00:00.000Z",
      updatedAt: "2026-09-06T20:20:00.000Z",
    },
  ],
};

export function MerchantPurchasePreview() {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
        mutations: { retry: false },
      },
    });
    client.setQueryData(queryKeys.me, me);
    client.setQueryData(queryKeys.myCharacters, characters);
    client.setQueryData(queryKeys.merchant(campaignId), catalog);
    client.setQueryData([...queryKeys.merchantPurchases(campaignId), "self"], purchases);
    client.setQueryData(queryKeys.merchantPurchases(campaignId), purchases);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <main id="main-content">
        <section className="mx-auto w-full max-w-7xl space-y-12 px-4 py-10 sm:px-6">
          <MerchantCatalog campaignId={campaignId} pollingEnabled={false} />
        </section>
        <section className="admin-main merchant-preview-management" aria-labelledby="merchant-preview-management-title">
          <header className="admin-page-heading">
            <div>
              <span className="admin-eyebrow">Prévia de gestão</span>
              <h1 id="merchant-preview-management-title">Pedidos do Mercador</h1>
              <p>Estado local usado para revisar a fila e as decisões do mestre.</p>
            </div>
          </header>
          <div className="admin-workspace">
            <MerchantPurchasesPanel campaignId={campaignId} pollingEnabled={false} />
          </div>
        </section>
      </main>
    </QueryClientProvider>
  );
}
