"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCoins, fromBits, type SedeShopResponse } from "@ordem/contracts";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/surface";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { queryKeys } from "@/lib/query-keys";
import { SearchField } from "../admin/kit";

export type ShopSelection = ReadonlyMap<string, number>;

/**
 * Itens Comuns do Lojista para a atividade Preparar Suprimentos. O jogador
 * ajusta as quantidades; o total nunca passa do limite da atividade.
 */
export function ShopPicker({
  campaignId,
  activityId,
  selection,
  onChange,
}: Readonly<{
  campaignId: string;
  activityId: string;
  selection: ShopSelection;
  onChange: (next: ShopSelection) => void;
}>) {
  const [search, setSearch] = useState("");
  const shop = useQuery({
    queryKey: queryKeys.sedeShop(campaignId, activityId),
    queryFn: () => apiFetch<SedeShopResponse>(`/api/campaigns/${campaignId}/sede/activities/${activityId}/shop`),
  });

  const total = useMemo(() => {
    const prices = new Map((shop.data?.items ?? []).map((item) => [item.catalogItemId, item.priceBits]));
    let bits = 0;
    for (const [id, quantity] of selection) bits += (prices.get(id) ?? 0) * quantity;
    return bits;
  }, [selection, shop.data]);

  if (shop.isPending) return <Skeleton className="h-40 w-full" />;
  if (shop.isError) {
    return (
      <Notice tone="danger" role="alert">
        {errorMessage(shop.error)}
      </Notice>
    );
  }

  const { items, limitBits, limitLabel } = shop.data;
  const remaining = limitBits - total;
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const visible = term
    ? items.filter((item) => `${item.name} ${item.category}`.toLocaleLowerCase("pt-BR").includes(term))
    : items;
  const setQuantity = (id: string, quantity: number) => {
    const next = new Map(selection);
    if (quantity <= 0) next.delete(id);
    else next.set(id, quantity);
    onChange(next);
  };

  if (items.length === 0) {
    return (
      <Notice tone="warning">
        O Lojista não tem itens Comuns até {limitLabel} no catálogo. Fale com o Guardião.
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted" aria-live="polite">
        Total: <strong className="text-fg">{total > 0 ? formatCoins(fromBits(total)) : "nada escolhido"}</strong> de{" "}
        {limitLabel}.
        {total > 0 && remaining > 0 ? ` Ainda cabem ${formatCoins(fromBits(remaining))}.` : null}
      </p>
      <SearchField label="Buscar item" value={search} onChange={setSearch} placeholder="Nome ou categoria" />
      <ul className="max-h-[45dvh] divide-y divide-line-soft overflow-y-auto rounded-md border border-line-soft">
        {visible.map((item) => {
          const quantity = selection.get(item.catalogItemId) ?? 0;
          const canAdd = item.priceBits <= remaining;
          return (
            <li key={item.catalogItemId} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold text-fg">{item.name}</span>
                <span className="block text-xs text-fg-subtle">
                  {item.category} · {item.priceLabel}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Tirar um ${item.name}`}
                  disabled={quantity === 0}
                  onClick={() => setQuantity(item.catalogItemId, quantity - 1)}
                >
                  −
                </Button>
                <span className={cn("w-6 text-center tabular-nums", quantity === 0 && "text-fg-subtle")} aria-label={`${quantity} de ${item.name}`}>
                  {quantity}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Adicionar um ${item.name}`}
                  disabled={!canAdd || quantity >= 20}
                  onClick={() => setQuantity(item.catalogItemId, quantity + 1)}
                >
                  +
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
