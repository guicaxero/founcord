"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MerchantCatalogItem,
  MerchantItemProjection,
  MerchantStockCurrentResponse,
  MerchantStockPatch,
  MerchantStockPatchInput,
  MerchantStockTargetListResponse,
} from "@ordem/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { priceLabel } from "@/components/coins";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader, PanelLoading } from "../kit";
import { CatalogPicker, ItemLabel, QuantityInput } from "./catalog-picker";

const MAX_CHANGES = 100;

type Added = Readonly<{ catalogItemId: string; quantity: number }>;

/** Mesmo nome, sem acento nem caixa, e mesmo tipo: o módulo trata como o mesmo item. */
function sameItemKey(name: string, kind: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pt-BR");
  return `${kind}|${normalized}`;
}

function projectionKind(item: MerchantItemProjection): string {
  return item.weapon ? "weapon" : item.armor ? "armor" : "item";
}

/**
 * Estoque real do Lojista, como o módulo sincronizou por último. O mestre muda
 * quantidades (inclusive dos itens colocados à mão), remove e acrescenta itens
 * do catálogo; só as mudanças vão ao Foundry.
 */
export function CurrentStockTab({
  campaignId,
  catalog,
  onOpenCatalog,
}: Readonly<{
  campaignId: string;
  catalog: readonly MerchantCatalogItem[];
  onOpenCatalog: () => void;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const saveTriggerRef = useRef<HTMLButtonElement>(null);
  const [worldId, setWorldId] = useState("");
  const [quantities, setQuantities] = useState<ReadonlyMap<string, number>>(new Map());
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<readonly Added[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [patchId, setPatchId] = useState<string | null>(null);

  const targets = useQuery({
    queryKey: queryKeys.merchantStockTargets(campaignId),
    queryFn: () => apiFetch<MerchantStockTargetListResponse>(`/api/campaigns/${campaignId}/merchant/stock/targets`),
    staleTime: 30_000,
  });
  const usable = (targets.data?.data ?? []).filter((target) => target.blockedReason !== "revoked");
  const target = usable.find((candidate) => candidate.worldId === worldId) ?? usable[0] ?? null;

  const stock = useQuery({
    queryKey: queryKeys.merchantStockCurrent(campaignId, target?.worldId ?? ""),
    queryFn: () =>
      apiFetch<MerchantStockCurrentResponse>(
        `/api/campaigns/${campaignId}/merchant/stock/current?worldId=${encodeURIComponent(target!.worldId)}`,
      ),
    enabled: Boolean(target && !target.blockedReason),
  });
  const patch = useQuery({
    queryKey: queryKeys.merchantStockPatch(campaignId, patchId ?? ""),
    queryFn: () => apiFetch<MerchantStockPatch>(`/api/campaigns/${campaignId}/merchant/stock/patches/${patchId}`),
    enabled: Boolean(patchId),
    refetchInterval: (query) => (query.state.data?.status === "pending_delivery" ? 5_000 : false),
  });

  // Quando o módulo responde, o Lojista sincroniza logo depois: lê de novo.
  const settled = patch.data && patch.data.status !== "pending_delivery" ? patch.data.status : null;
  useEffect(() => {
    if (!settled) return;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId, "merchant", "stock", "current"] });
    void refresh();
    const timer = setTimeout(refresh, 4_000);
    return () => clearTimeout(timer);
  }, [settled, campaignId, queryClient]);

  const active = useMemo(() => catalog.filter((item) => item.active), [catalog]);
  const catalogById = useMemo(() => new Map(active.map((item) => [item.id, item])), [active]);
  const items = useMemo(() => stock.data?.items ?? [], [stock.data]);
  const inStock = useMemo(() => {
    const keys = new Set<string>();
    for (const item of items) {
      if (removed.has(item.itemId)) continue;
      if (item.catalogItemId) keys.add(`catalog:${item.catalogItemId}`);
      keys.add(sameItemKey(item.name, projectionKind(item)));
    }
    return keys;
  }, [items, removed]);

  const changedQuantities = items.filter(
    (item) => !removed.has(item.itemId) && quantities.has(item.itemId) && quantities.get(item.itemId) !== item.quantity,
  );
  const changes = changedQuantities.length + removed.size + added.length;
  const full = changes >= MAX_CHANGES;

  function discard() {
    setQuantities(new Map());
    setRemoved(new Set());
    setAdded([]);
  }

  const save = useMutation({
    mutationFn: () => {
      const body: MerchantStockPatchInput = {
        worldId: target!.worldId,
        operations: [
          ...changedQuantities.map((item) => ({
            op: "set" as const,
            itemId: item.itemId,
            from: item.quantity,
            quantity: quantities.get(item.itemId)!,
          })),
          ...[...removed].map((itemId) => ({ op: "remove" as const, itemId })),
          ...added.map((entry) => ({ op: "add" as const, ...entry })),
        ],
      };
      return apiFetch<MerchantStockPatch>(`/api/campaigns/${campaignId}/merchant/stock/patches`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (result) => {
      setConfirming(false);
      setPatchId(result.id);
      queryClient.setQueryData(queryKeys.merchantStockPatch(campaignId, result.id), result);
      discard();
      toast(
        result.status === "failed"
          ? { title: "As mudanças não foram enviadas", description: result.error ?? undefined, tone: "danger" }
          : {
              title: "Mudanças enviadas ao Foundry",
              description: "O Lojista é atualizado quando o mestre estiver no mundo.",
              tone: "info",
            },
      );
    },
  });

  if (active.length === 0 && items.length === 0 && !stock.isPending) {
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
  if (targets.isPending) return <PanelLoading label="Consultando os mundos do Foundry" />;
  if (targets.isError) {
    return (
      <FeedbackState
        title="Não foi possível consultar os mundos"
        tone="error"
        role="alert"
        action={<Button onClick={() => targets.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(targets.error)}
      </FeedbackState>
    );
  }
  if (!target) {
    return (
      <FeedbackState title="Nenhum mundo conectado">
        Conecte um mundo do Foundry com o módulo e escolha o ator do Lojista para ver o estoque aqui.
      </FeedbackState>
    );
  }

  const header = (
    <PanelHeader
      eyebrow="Estoque atual"
      title={stock.data?.merchantName ? `O que ${stock.data.merchantName} tem agora` : "O que o Lojista tem agora"}
      description="Mude quantidades, remova ou acrescente itens do catálogo. Só as mudanças vão ao Foundry; o resto do estoque fica como está, inclusive o que foi colocado à mão."
      actions={
        <Button size="sm" disabled={stock.isFetching || !stock.data} onClick={() => stock.refetch()}>
          {stock.isFetching ? "Atualizando…" : "Atualizar"}
        </Button>
      }
    />
  );
  const worldPicker =
    usable.length > 1 ? (
      <Field label="Mundo" className="w-full sm:w-80">
        {({ id }) => (
          <Select
            id={id}
            value={target.worldId}
            onChange={(event) => {
              discard();
              setWorldId(event.target.value);
            }}
          >
            {usable.map((candidate) => (
              <option key={candidate.worldId} value={candidate.worldId}>
                {candidate.worldTitle}
                {candidate.merchantName ? ` — Lojista: ${candidate.merchantName}` : ""}
              </option>
            ))}
          </Select>
        )}
      </Field>
    ) : null;

  if (target.blockedReason === "merchant_missing") {
    return (
      <div className="space-y-6">
        {header}
        {worldPicker}
        <Notice tone="warning" title="Nenhum Lojista escolhido neste mundo">
          Escolha o ator do Lojista na tela de conexão do módulo no Foundry.
        </Notice>
      </div>
    );
  }

  const rows = items.map((item) => ({
    item,
    quantity: quantities.get(item.itemId) ?? item.quantity ?? 1,
    isRemoved: removed.has(item.itemId),
    changed: quantities.has(item.itemId) && quantities.get(item.itemId) !== item.quantity,
  }));
  const addedRows = added.flatMap((entry) => {
    const item = catalogById.get(entry.catalogItemId);
    return item ? [{ item, quantity: entry.quantity }] : [];
  });

  return (
    <div className="space-y-6">
      {header}
      {worldPicker}
      <PatchNotice patch={patch.data ?? null} />
      {!target.supportsPatch ? (
        <Notice tone="warning" title="Atualize o módulo para editar item a item">
          O módulo deste mundo está na versão {target.moduleVersion}. A edição do estoque atual precisa da 0.13.0 ou mais
          nova. Enquanto isso, o Sorteio e Trocar o estoque continuam funcionando.
        </Notice>
      ) : null}
      {stock.isError ? (
        <Notice tone="danger" role="alert" title="Não foi possível ler o estoque do Lojista">
          {errorMessage(stock.error)}
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <CatalogPicker
          catalog={active}
          full={full}
          blockedLabel={(item) =>
            added.some((entry) => entry.catalogItemId === item.id)
              ? "Na lista"
              : inStock.has(`catalog:${item.id}`) || inStock.has(sameItemKey(item.name, item.kind))
                ? "No Lojista"
                : null
          }
          onAdd={(item) => setAdded((current) => [...current, { catalogItemId: item.id, quantity: 1 }])}
        />

        <Card className="min-w-0 space-y-4">
          <PanelHeader
            as="h3"
            title="No Lojista"
            description={
              stock.data?.syncedAt
                ? `${items.length} ${items.length === 1 ? "item" : "itens"} · lido em ${formatDateTime(stock.data.syncedAt)}${stock.data.online ? "" : " · mundo offline"}.`
                : stock.isPending
                  ? "Lendo o estoque…"
                  : "O módulo ainda não enviou o estoque deste Lojista."
            }
          />
          {stock.isPending ? (
            <p className="text-sm text-fg-muted" role="status">
              Lendo o estoque do Lojista…
            </p>
          ) : rows.length === 0 && addedRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
              O Lojista está vazio. Adicione itens do catálogo.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft rounded-md border border-line-soft">
              {rows.map(({ item, quantity, isRemoved, changed }) => (
                <li key={item.itemId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <span className={`min-w-0 flex-1 space-y-1 ${isRemoved ? "opacity-60" : ""}`}>
                    <span className={`block truncate font-semibold text-fg ${isRemoved ? "line-through" : ""}`}>
                      {item.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
                      <Badge tone={item.origin === "portal" ? "info" : "neutral"} className="px-2 py-0.5">
                        {item.origin === "portal" ? "Do portal" : item.origin === "manual" ? "Colocado à mão" : "No ator"}
                      </Badge>
                      {item.category ? <span>{item.category}</span> : null}
                      <span>{item.price ? priceLabel(item.price) : "Sem preço"}</span>
                      {isRemoved ? <Badge tone="danger" className="px-2 py-0.5">Será removido</Badge> : null}
                      {changed && !isRemoved ? (
                        <Badge tone="warning" className="px-2 py-0.5">
                          Era {item.quantity ?? "—"}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    {isRemoved ? null : (
                      <QuantityInput
                        label={`Quantidade de ${item.name}`}
                        value={quantity}
                        min={0}
                        max={1_000}
                        onChange={(next) =>
                          setQuantities((current) => {
                            const updated = new Map(current);
                            if (next === item.quantity) updated.delete(item.itemId);
                            else updated.set(item.itemId, next);
                            return updated;
                          })
                        }
                      />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!isRemoved && full}
                      aria-label={isRemoved ? `Manter ${item.name}` : `Remover ${item.name}`}
                      onClick={() =>
                        setRemoved((current) => {
                          const updated = new Set(current);
                          if (updated.has(item.itemId)) updated.delete(item.itemId);
                          else updated.add(item.itemId);
                          return updated;
                        })
                      }
                    >
                      {isRemoved ? "Manter" : "Remover"}
                    </Button>
                  </div>
                </li>
              ))}
              {addedRows.map(({ item, quantity }) => (
                <li key={`novo-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 space-y-1">
                    <ItemLabel item={item} />
                    <Badge tone="success" className="px-2 py-0.5">
                      Novo
                    </Badge>
                  </span>
                  <div className="flex items-center gap-2">
                    <QuantityInput
                      label={`Quantidade de ${item.name}`}
                      value={quantity}
                      onChange={(next) =>
                        setAdded((current) =>
                          current.map((entry) => (entry.catalogItemId === item.id ? { ...entry, quantity: next } : entry)),
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Tirar ${item.name} da lista`}
                      onClick={() => setAdded((current) => current.filter((entry) => entry.catalogItemId !== item.id))}
                    >
                      Tirar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line-soft pt-4">
            <p className="mr-auto text-sm text-fg-muted" aria-live="polite">
              {changes === 0
                ? "Nenhuma mudança."
                : `${changes} ${changes === 1 ? "mudança" : "mudanças"}${full ? ` · limite de ${MAX_CHANGES}` : ""}.`}
            </p>
            <Button variant="ghost" disabled={changes === 0} onClick={discard}>
              Descartar mudanças
            </Button>
            <Button
              ref={saveTriggerRef}
              variant="primary"
              disabled={changes === 0 || !target.supportsPatch || !stock.data}
              onClick={() => {
                save.reset();
                setConfirming(true);
              }}
            >
              Salvar no Foundry
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Salvar estas mudanças no Foundry?"
        description={[
          changedQuantities.length > 0
            ? `${changedQuantities.length} ${changedQuantities.length === 1 ? "quantidade" : "quantidades"}`
            : null,
          removed.size > 0 ? `${removed.size} ${removed.size === 1 ? "item removido" : "itens removidos"}` : null,
          added.length > 0 ? `${added.length} ${added.length === 1 ? "item novo" : "itens novos"}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        confirmLabel="Salvar no Foundry"
        busyLabel="Enviando…"
        busy={save.isPending}
        error={save.isError ? errorMessage(save.error) : null}
        onCancel={() => setConfirming(false)}
        onConfirm={() => save.mutate()}
        returnFocusRef={saveTriggerRef}
      >
        <p>
          Só as mudanças são enviadas. O resto do estoque fica como está, inclusive o que foi colocado à mão. Se a
          quantidade de um item mudar no Foundry antes de o envio chegar (uma compra, por exemplo), aquele item não é
          alterado e o portal avisa. Se o mestre não estiver no mundo agora, o envio espera na fila até ele entrar.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** Situação da última edição enviada e o que o Foundry não aplicou. */
function PatchNotice({ patch }: Readonly<{ patch: MerchantStockPatch | null }>) {
  if (!patch) return null;
  if (patch.status === "pending_delivery") {
    return (
      <Notice tone="info" role="status" title="Aguardando o Foundry">
        As mudanças estão na fila e são aplicadas assim que o mestre entrar no mundo com o módulo conectado.
      </Notice>
    );
  }
  if (patch.status === "failed") {
    return (
      <Notice tone="danger" role="alert" title="O Foundry não aplicou as mudanças">
        {patch.error ?? "Tente de novo."}
      </Notice>
    );
  }
  const skipped = patch.operations.filter((entry) => entry.outcome && entry.outcome !== "applied");
  if (skipped.length === 0) {
    return (
      <Notice tone="success" role="status" title="Mudanças aplicadas no Lojista">
        {patch.appliedAt ? `Aplicadas em ${formatDateTime(patch.appliedAt)}. ` : null}A lista abaixo mostra o estoque
        lido depois disso.
      </Notice>
    );
  }
  return (
    <Notice tone="warning" role="alert" title="Algumas mudanças não foram aplicadas">
      <ul className="list-disc space-y-1 pl-5">
        {skipped.map((entry, index) => (
          <li key={`${entry.name}-${index}`}>
            {entry.name}:{" "}
            {entry.outcome === "conflict"
              ? "a quantidade mudou no Foundry depois da leitura. Confira o valor atual e tente de novo."
              : "o item não está mais no Lojista."}
          </li>
        ))}
      </ul>
    </Notice>
  );
}
