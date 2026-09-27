"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MerchantCatalogItem,
  MerchantStockDraw,
  MerchantStockDrawListResponse,
  MerchantStockTargetListResponse,
} from "@ordem/contracts";
import { useMemo, useRef, useState } from "react";
import { priceLabel } from "@/components/coins";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader, SearchField } from "../kit";
import { availabilityLabel, availabilityTone, combatSummary } from "./presentation";
import { DeliveryNotice } from "./stock-draw-tab";

/** Item escolhido e a quantidade; a ordem é a de inclusão. */
export type SelectedEntry = Readonly<{ catalogItemId: string; quantity: number }>;

const MAX_ENTRIES = 100;
const VISIBLE_RESULTS = 40;

/** Envio que representa o que o Lojista tem hoje pelo portal: o último aplicado ou a caminho. */
export function currentStockDraw(draws: readonly MerchantStockDraw[]): MerchantStockDraw | null {
  return draws.find((draw) => draw.status === "applied" || draw.status === "pending_delivery") ?? null;
}

/**
 * Seleção manual do estoque: o mestre escolhe item a item no catálogo e envia.
 * O módulo troca os itens que o portal enviou antes; o que foi colocado à mão
 * no Foundry continua no ator.
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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
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
  const categories = useMemo(
    () => [...new Set(active.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [active],
  );
  const chosen = useMemo(() => new Set(selection.map((entry) => entry.catalogItemId)), [selection]);
  const results = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return active.filter(
      (item) =>
        (!category || item.category === category) &&
        (!term || `${item.name} ${item.category}`.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [active, category, search]);

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
      title: "Estoque atual carregado",
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
        eyebrow="Seleção manual"
        title="Escolher o estoque"
        description="Monte o estoque item a item. Ao enviar, o módulo troca os itens que o portal colocou antes no Lojista; o que foi colocado à mão no Foundry continua lá."
      />
      <DeliveryNotice
        draw={lastManual && lastManual.status !== "preview" ? lastManual : null}
        targets={targets.data?.data ?? []}
        targetsError={targets.isError ? errorMessage(targets.error) : null}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="min-w-0 space-y-4">
          <PanelHeader as="h3" title="Catálogo" description={`${active.length} itens ativos.`} />
          <div className="flex flex-wrap items-end gap-3">
            <SearchField label="Buscar item" value={search} onChange={setSearch} placeholder="Nome ou categoria" />
            <Field label="Categoria" className="w-full sm:w-56">
              {({ id }) => (
                <Select id={id} value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Todas</option>
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <p className="text-xs text-fg-subtle" aria-live="polite">
            {results.length > VISIBLE_RESULTS
              ? `Mostrando ${VISIBLE_RESULTS} de ${results.length}. Refine a busca para ver os demais.`
              : `${results.length} ${results.length === 1 ? "item" : "itens"}.`}
          </p>
          {results.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
              Nenhum item encontrado. Tente outro termo ou outra categoria.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft rounded-md border border-line-soft">
              {results.slice(0, VISIBLE_RESULTS).map((item) => {
                const inSelection = chosen.has(item.id);
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <ItemLabel item={item} />
                    <Button
                      size="sm"
                      variant={inSelection ? "ghost" : "secondary"}
                      disabled={inSelection || full}
                      aria-label={inSelection ? `${item.name} já está na seleção` : `Adicionar ${item.name}`}
                      onClick={() => add(item)}
                    >
                      {inSelection ? "Na seleção" : "Adicionar"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

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
                  Carregar o estoque atual
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

function ItemLabel({ item }: Readonly<{ item: MerchantCatalogItem }>) {
  const combat = combatSummary(item);
  return (
    <span className="min-w-0 flex-1 space-y-1">
      <span className="block truncate font-semibold text-fg">{item.name}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
        <Badge tone={availabilityTone[item.availability]} className="px-2 py-0.5">
          {availabilityLabel(item.availability)}
        </Badge>
        <span>{item.category}</span>
        <span>{item.price ? priceLabel(item.price) : "Sem preço"}</span>
        {combat !== "—" ? <span>{combat}</span> : null}
      </span>
    </span>
  );
}

/** Quantidade de 1 a 100, com texto livre enquanto se digita. */
function QuantityInput({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: number; onChange: (value: number) => void }>) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(String(value));
  }
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      max={100}
      step={1}
      aria-label={label}
      className="w-20 tabular-nums"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number.parseInt(event.target.value, 10);
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) {
          setShown(parsed);
          onChange(parsed);
        }
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
