"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MerchantCatalogItem,
  MerchantStockDraw,
  MerchantStockDrawListResponse,
  MerchantStockTargetListResponse,
} from "@ordem/contracts";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader } from "../kit";
import { CatalogPicker, ItemLabel, QuantityInput } from "./catalog-picker";
import { DeliveryNotice } from "./stock-draw-tab";

/** Item escolhido e a quantidade; a ordem é a de inclusão. */
export type SelectedEntry = Readonly<{ catalogItemId: string; quantity: number }>;

const MAX_ENTRIES = 100;

/** Envio que representa o que o Lojista tem hoje pelo portal: o último aplicado ou a caminho. */
export function currentStockDraw(draws: readonly MerchantStockDraw[]): MerchantStockDraw | null {
  return draws.find((draw) => draw.status === "applied" || draw.status === "pending_delivery") ?? null;
}

/**
 * Estoque novo, montado do zero: o mestre escolhe item a item no catálogo e
 * envia. O módulo troca os itens que o portal enviou antes; o que foi colocado
 * à mão no Foundry continua no ator. Para mudar só alguns itens, há a aba
 * Estoque atual.
 */
export function SelectionTab({
  campaignId,
  catalog,
  selection,
  onSelectionChange,
  onOpenCatalog,
}: Readonly<{
  campaignId: string;
  catalog: readonly MerchantCatalogItem[];
  selection: readonly SelectedEntry[];
  onSelectionChange: (next: readonly SelectedEntry[]) => void;
  onOpenCatalog: () => void;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const sendTriggerRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [worldId, setWorldId] = useState("");

  const draws = useQuery({
    queryKey: queryKeys.merchantStockDraws(campaignId),
    queryFn: () => apiFetch<MerchantStockDrawListResponse>(`/api/campaigns/${campaignId}/merchant/stock/draws`),
    refetchInterval: (query) =>
      query.state.data?.data.some((draw) => draw.status === "pending_delivery") ? 10_000 : false,
  });
  const targets = useQuery({
    queryKey: queryKeys.merchantStockTargets(campaignId),
    queryFn: () => apiFetch<MerchantStockTargetListResponse>(`/api/campaigns/${campaignId}/merchant/stock/targets`),
    staleTime: 30_000,
  });

  const active = useMemo(() => catalog.filter((item) => item.active), [catalog]);
  const byId = useMemo(() => new Map(active.map((item) => [item.id, item])), [active]);
  const chosen = useMemo(() => new Set(selection.map((entry) => entry.catalogItemId)), [selection]);

  const rows = selection.flatMap((entry) => {
    const item = byId.get(entry.catalogItemId);
    return item ? [{ item, quantity: entry.quantity }] : [];
  });
  const units = rows.reduce((total, row) => total + row.quantity, 0);
  const current = currentStockDraw(draws.data?.data ?? []);
  const lastManual = draws.data?.data.find((draw) => draw.mode === "manual") ?? null;
  const availableTargets = (targets.data?.data ?? []).filter((target) => !target.blockedReason);
  const chosenWorld = availableTargets.some((target) => target.worldId === worldId)
    ? worldId
    : availableTargets[0]?.worldId ?? "";
  const full = selection.length >= MAX_ENTRIES;

  const send = useMutation({
    mutationFn: async (target: string) => {
      const draw = await apiFetch<MerchantStockDraw>(`/api/campaigns/${campaignId}/merchant/stock/selections`, {
        method: "POST",
        body: JSON.stringify({ entries: rows.map(({ item, quantity }) => ({ catalogItemId: item.id, quantity })) }),
      });
      return apiFetch<MerchantStockDraw>(`/api/campaigns/${campaignId}/merchant/stock/draws/${draw.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ worldId: target }),
      });
    },
    onSuccess: async (draw) => {
      setConfirming(false);
      toast(
        draw.status === "failed"
          ? { title: "A seleção não foi enviada", description: draw.error ?? undefined, tone: "danger" }
          : {
              title: "Seleção enviada ao Foundry",
              description: "Os itens aparecem no Lojista quando o mestre estiver no mundo.",
              tone: "info",
            },
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchantStockDraws(campaignId) });
    },
  });

  function add(item: MerchantCatalogItem) {
    if (chosen.has(item.id) || full) return;
    onSelectionChange([...selection, { catalogItemId: item.id, quantity: 1 }]);
  }

  function setQuantity(catalogItemId: string, quantity: number) {
    onSelectionChange(
      selection.map((entry) => (entry.catalogItemId === catalogItemId ? { ...entry, quantity } : entry)),
    );
  }

  function remove(catalogItemId: string) {
    onSelectionChange(selection.filter((entry) => entry.catalogItemId !== catalogItemId));
  }

  function loadCurrent() {
    if (!current) return;
    const kept = current.entries.filter((entry) => byId.has(entry.catalogItemId));
    onSelectionChange(kept.map((entry) => ({ catalogItemId: entry.catalogItemId, quantity: entry.quantity })));
    const dropped = current.entries.length - kept.length;
    toast({
      title: "Último envio carregado",
      description:
        dropped > 0
          ? `${dropped} ${dropped === 1 ? "item não está mais ativo" : "itens não estão mais ativos"} no catálogo e ficou de fora.`
          : `${kept.length} ${kept.length === 1 ? "item" : "itens"} do envio de ${formatDateTime(current.createdAt)}.`,
    });
  }

  if (active.length === 0) {
    return (
      <FeedbackState
        title="O catálogo do Lojista está vazio"
        action={
          <Button variant="accent" onClick={onOpenCatalog}>
            Abrir o catálogo
          </Button>
        }
      >
        Importe a lista base ou cadastre itens antes de montar o estoque.
      </FeedbackState>
    );
  }

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Trocar o estoque"
        title="Montar um estoque novo"
        description="Monte o estoque do zero, item a item. Ao enviar, o módulo troca tudo o que o portal colocou antes no Lojista; o que foi colocado à mão no Foundry continua lá. Para mudar só alguns itens, use Estoque atual."
      />
      <DeliveryNotice
        draw={lastManual && lastManual.status !== "preview" ? lastManual : null}
        targets={targets.data?.data ?? []}
        targetsError={targets.isError ? errorMessage(targets.error) : null}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <CatalogPicker
          catalog={active}
          blockedLabel={(item) => (chosen.has(item.id) ? "Na seleção" : null)}
          full={full}
          onAdd={add}
        />

        <Card className="min-w-0 space-y-4">
          <PanelHeader
            as="h3"
            title="Estoque escolhido"
            description={
              rows.length === 0
                ? "Nenhum item ainda."
                : `${rows.length} ${rows.length === 1 ? "item" : "itens"} · ${units} ${units === 1 ? "unidade" : "unidades"}${full ? ` · limite de ${MAX_ENTRIES} itens` : ""}.`
            }
            actions={
              <>
                <Button
                  size="sm"
                  disabled={!current}
                  title={current ? undefined : "Nenhum estoque foi enviado pelo portal ainda."}
                  onClick={loadCurrent}
                >
                  Carregar o último envio
                </Button>
                <Button size="sm" variant="ghost" disabled={rows.length === 0} onClick={() => onSelectionChange([])}>
                  Limpar
                </Button>
              </>
            }
          />
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
              Adicione itens do catálogo ou carregue o estoque que o portal enviou por último.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft rounded-md border border-line-soft">
              {rows.map(({ item, quantity }) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <ItemLabel item={item} />
                  <div className="flex items-center gap-2">
                    <QuantityInput
                      label={`Quantidade de ${item.name}`}
                      value={quantity}
                      onChange={(next) => setQuantity(item.id, next)}
                    />
                    <Button size="sm" variant="ghost" aria-label={`Remover ${item.name}`} onClick={() => remove(item.id)}>
                      Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line-soft pt-4">
            <Button
              ref={sendTriggerRef}
              variant="primary"
              disabled={rows.length === 0 || availableTargets.length === 0}
              onClick={() => {
                send.reset();
                setConfirming(true);
              }}
            >
              Enviar ao Foundry
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Enviar esta seleção ao Foundry?"
        description={`${rows.length} ${rows.length === 1 ? "item" : "itens"} e ${units} ${units === 1 ? "unidade" : "unidades"} no ator do Lojista.`}
        confirmLabel="Enviar ao Foundry"
        busyLabel="Enviando…"
        busy={send.isPending}
        error={send.isError ? errorMessage(send.error) : null}
        onCancel={() => setConfirming(false)}
        onConfirm={() => chosenWorld && send.mutate(chosenWorld)}
        returnFocusRef={sendTriggerRef}
      >
        <p>
          Os itens que o portal enviou antes (por sorteio ou seleção) são trocados por estes. Itens que você colocou à
          mão no ator continuam lá. Se o mestre não estiver no mundo agora, o envio espera na fila até ele entrar.
        </p>
        {availableTargets.length > 1 ? (
          <Field label="Mundo de destino">
            {({ id }) => (
              <Select id={id} value={chosenWorld} onChange={(event) => setWorldId(event.target.value)}>
                {availableTargets.map((target) => (
                  <option key={target.worldId} value={target.worldId}>
                    {target.worldTitle} — Lojista: {target.merchantName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : availableTargets[0] ? (
          <p>
            Destino: <strong className="text-fg">{availableTargets[0].merchantName}</strong>, em{" "}
            {availableTargets[0].worldTitle}.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

