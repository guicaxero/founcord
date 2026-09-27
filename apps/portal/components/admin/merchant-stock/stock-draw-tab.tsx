"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isEligibleForDraw,
  type MerchantCatalogItem,
  type MerchantStockCriteria,
  type MerchantStockDraw,
  type MerchantStockDrawListResponse,
  type MerchantStockTarget,
  type MerchantStockTargetListResponse,
} from "@ordem/contracts";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { priceLabel } from "@/components/coins";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { Notice } from "@/components/ui/notice";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader, PanelLoading } from "../kit";
import {
  availabilityLabel,
  availabilityTone,
  ceilingOptions,
  combatSummary,
  criteriaSummary,
  drawStatusContent,
  handlingSummary,
} from "./presentation";

const blockedCopy: Readonly<Record<NonNullable<MerchantStockTarget["blockedReason"]>, string>> = {
  module_outdated: "o módulo precisa ser atualizado para a versão 0.8.0 ou mais nova",
  merchant_missing: "nenhum ator foi escolhido como Lojista na tela de conexão do módulo",
  revoked: "o mundo foi desconectado da campanha",
};

export function StockDrawTab({
  campaignId,
  catalog,
  onOpenCatalog,
}: Readonly<{ campaignId: string; catalog: readonly MerchantCatalogItem[]; onOpenCatalog: () => void }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const sendTriggerRef = useRef<HTMLButtonElement>(null);
  const [criteria, setCriteria] = useState<MerchantStockCriteria>({
    maxAvailability: "common",
    categories: [],
    quantity: 10,
    allowRepeat: false,
  });
  const [confirming, setConfirming] = useState(false);
  const [worldId, setWorldId] = useState("");

  const draws = useQuery({
    queryKey: queryKeys.merchantStockDraws(campaignId),
    queryFn: () => apiFetch<MerchantStockDrawListResponse>(`/api/campaigns/${campaignId}/merchant/stock/draws`),
    // O módulo só aplica com o mestre no mundo; enquanto isso, consultamos devagar.
    refetchInterval: (query) =>
      query.state.data?.data.some((draw) => draw.status === "pending_delivery") ? 10_000 : false,
  });
  const targets = useQuery({
    queryKey: queryKeys.merchantStockTargets(campaignId),
    queryFn: () => apiFetch<MerchantStockTargetListResponse>(`/api/campaigns/${campaignId}/merchant/stock/targets`),
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: (input: MerchantStockCriteria) =>
      apiFetch<MerchantStockDraw>(`/api/campaigns/${campaignId}/merchant/stock/draws`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchantStockDraws(campaignId) });
    },
  });
  const apply = useMutation({
    mutationFn: ({ drawId, target }: Readonly<{ drawId: string; target: string }>) =>
      apiFetch<MerchantStockDraw>(`/api/campaigns/${campaignId}/merchant/stock/draws/${drawId}/apply`, {
        method: "POST",
        body: JSON.stringify({ worldId: target }),
      }),
    onSuccess: async (draw) => {
      setConfirming(false);
      toast(
        draw.status === "failed"
          ? { title: "O estoque não foi enviado", description: draw.error ?? undefined, tone: "danger" }
          : { title: "Estoque enviado ao Foundry", description: "Os itens aparecem no Lojista quando o mestre estiver no mundo.", tone: "info" },
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchantStockDraws(campaignId) });
    },
  });

  const activeItems = useMemo(() => catalog.filter((item) => item.active), [catalog]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of activeItems) {
      if (isEligibleForDraw(item, { ...criteria, categories: [] })) {
        counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
      } else if (!counts.has(item.category)) {
        counts.set(item.category, 0);
      }
    }
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "pt-BR"));
  }, [activeItems, criteria]);
  const eligibleCount = activeItems.filter((item) => isEligibleForDraw(item, criteria)).length;

  // A prévia mostrada é o sorteio mais recente ainda relevante.
  const latest = draws.data?.data[0] ?? null;
  const availableTargets = (targets.data?.data ?? []).filter((target) => !target.blockedReason);
  const chosenWorld = availableTargets.some((target) => target.worldId === worldId)
    ? worldId
    : availableTargets[0]?.worldId ?? "";

  if (activeItems.length === 0) {
    return (
      <FeedbackState
        title="O catálogo do Lojista está vazio"
        action={<Button variant="accent" onClick={onOpenCatalog}>Abrir o catálogo</Button>}
      >
        Importe a lista base ou cadastre itens antes de sortear o estoque.
      </FeedbackState>
    );
  }

  function toggleCategory(category: string) {
    setCriteria((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((value) => value !== category)
        : [...current.categories, category],
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(criteria);
  }

  return (
    <div className="space-y-8">
      <Card className="space-y-6">
        <PanelHeader
          eyebrow="Critérios"
          title="Sortear o estoque"
          description="O sistema filtra o catálogo por disponibilidade e categoria e sorteia os itens. Todos os itens permitidos têm a mesma chance."
        />
        <form className="space-y-6" onSubmit={submit}>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Disponibilidade máxima</legend>
            <FilterChips
              label="Disponibilidade máxima"
              value={criteria.maxAvailability}
              onChange={(value) => setCriteria((current) => ({ ...current, maxAvailability: value }))}
              options={ceilingOptions.map((option) => ({ value: option.value, label: option.label }))}
            />
            <p className="text-xs text-fg-subtle">
              {ceilingOptions.find((option) => option.value === criteria.maxAvailability)?.hint}
            </p>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Categorias</legend>
            <CategoryPicker
              categories={categories}
              selected={criteria.categories}
              onToggle={toggleCategory}
              onClear={() => setCriteria((current) => ({ ...current, categories: [] }))}
            />
          </fieldset>

          <div className="flex flex-wrap items-end gap-6">
            <Field label="Quantidade de itens" className="w-40">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  max={100}
                  value={criteria.quantity}
                  onChange={(event) =>
                    setCriteria((current) => ({
                      ...current,
                      quantity: Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                    }))
                  }
                  required
                />
              )}
            </Field>
            <Checkbox
              checked={criteria.allowRepeat}
              onChange={(event) => setCriteria((current) => ({ ...current, allowRepeat: event.target.checked }))}
              label="Permitir repetição (um item sorteado de novo soma quantidade)"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-4">
            <p className="text-sm text-fg-muted" aria-live="polite">
              {eligibleCount === 0
                ? "Nenhum item atende a esses critérios."
                : `${eligibleCount} ${eligibleCount === 1 ? "item atende" : "itens atendem"} a esses critérios.`}
              {!criteria.allowRepeat && eligibleCount > 0 && eligibleCount < criteria.quantity
                ? ` Sem repetição, o estoque terá no máximo ${eligibleCount}.`
                : null}
            </p>
            <Button type="submit" variant="accent" disabled={create.isPending || eligibleCount === 0}>
              {create.isPending ? "Sorteando…" : latest?.status === "preview" ? "Sortear de novo" : "Sortear estoque"}
            </Button>
          </div>
          {create.isError ? <Notice tone="danger" role="alert">{errorMessage(create.error)}</Notice> : null}
        </form>
      </Card>

      {draws.isPending ? (
        <PanelLoading label="Carregando o último sorteio" rows={2} />
      ) : draws.isError ? (
        <FeedbackState
          title="Não foi possível carregar os sorteios"
          tone="error"
          role="alert"
          action={<Button onClick={() => draws.refetch()}>Tentar novamente</Button>}
        >
          {errorMessage(draws.error)}
        </FeedbackState>
      ) : latest ? (
        <section className="space-y-5" aria-labelledby="stock-preview-title">
          <PanelHeader
            id="stock-preview-title"
            eyebrow={latest.status === "preview" ? "Prévia" : "Último sorteio"}
            title={`${latest.entries.length} ${latest.entries.length === 1 ? "item sorteado" : "itens sorteados"}`}
            description={`${criteriaSummary(latest.criteria)} · por ${latest.createdByName} em ${formatDateTime(latest.createdAt)}`}
            actions={
              <>
                <Badge tone={drawStatusContent[latest.status].tone}>{drawStatusContent[latest.status].label}</Badge>
                {latest.status === "preview" || latest.status === "failed" ? (
                  <Button
                    ref={sendTriggerRef}
                    variant="primary"
                    disabled={availableTargets.length === 0}
                    onClick={() => {
                      apply.reset();
                      setConfirming(true);
                    }}
                  >
                    Enviar ao Foundry
                  </Button>
                ) : null}
              </>
            }
          />
          <DeliveryNotice draw={latest} targets={targets.data?.data ?? []} targetsError={targets.isError ? errorMessage(targets.error) : null} />
          <DrawEntriesTable draw={latest} />
        </section>
      ) : (
        <FeedbackState title="Nenhum sorteio ainda">
          Escolha os critérios e clique em “Sortear estoque”. Nada vai para o Foundry antes de você confirmar.
        </FeedbackState>
      )}

      <ConfirmDialog
        open={confirming && Boolean(latest)}
        title="Enviar este estoque ao Foundry?"
        description="O módulo troca os itens sorteados antes por estes, no ator do Lojista."
        confirmLabel="Enviar ao Foundry"
        busyLabel="Enviando…"
        busy={apply.isPending}
        error={apply.isError ? errorMessage(apply.error) : null}
        onCancel={() => setConfirming(false)}
        onConfirm={() => latest && chosenWorld && apply.mutate({ drawId: latest.id, target: chosenWorld })}
        returnFocusRef={sendTriggerRef}
      >
        <p>
          Itens que você colocou à mão no ator continuam lá. Se o mestre não estiver no mundo agora, o
          envio espera na fila até ele entrar.
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

function CategoryPicker({
  categories,
  selected,
  onToggle,
  onClear,
}: Readonly<{
  categories: readonly (readonly [string, number])[];
  selected: readonly string[];
  onToggle: (category: string) => void;
  onClear: () => void;
}>) {
  const hintId = useId();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Categorias do sorteio" aria-describedby={hintId}>
        <Button size="sm" variant={selected.length === 0 ? "primary" : "secondary"} aria-pressed={selected.length === 0} onClick={onClear}>
          Todas
        </Button>
        {categories.map(([category, count]) => {
          const active = selected.includes(category);
          return (
            <Button
              key={category}
              size="sm"
              variant={active ? "primary" : "secondary"}
              aria-pressed={active}
              onClick={() => onToggle(category)}
            >
              {category}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[0.7rem] tabular-nums",
                  active ? "bg-fg-inverse/15" : "bg-surface-3 text-fg-subtle",
                )}
              >
                {count}
              </span>
            </Button>
          );
        })}
      </div>
      <p id={hintId} className="text-xs text-fg-subtle">
        Escolha uma ou mais categorias. O número mostra quantos itens de cada uma cabem na disponibilidade escolhida.
      </p>
    </div>
  );
}

function DeliveryNotice({
  draw,
  targets,
  targetsError,
}: Readonly<{ draw: MerchantStockDraw; targets: readonly MerchantStockTarget[]; targetsError: string | null }>) {
  if (draw.status === "pending_delivery") {
    return (
      <Notice tone="info" role="status" title="Aguardando o Foundry">
        O estoque está na fila e é aplicado assim que o mestre entrar no mundo com o módulo conectado.
      </Notice>
    );
  }
  if (draw.status === "applied") {
    return (
      <Notice tone="success" title="Estoque aplicado no Lojista">
        {draw.appliedAt ? `Aplicado em ${formatDateTime(draw.appliedAt)}. ` : null}O catálogo público se atualiza
        na próxima sincronização do Lojista.
      </Notice>
    );
  }
  if (draw.status === "failed") {
    return (
      <Notice tone="danger" role="alert" title="O Foundry não aplicou este estoque">
        {draw.error ?? "Tente enviar de novo."}
      </Notice>
    );
  }
  if (targetsError) return <Notice tone="warning">Não foi possível consultar os mundos agora: {targetsError}</Notice>;
  if (targets.length === 0) {
    return <Notice tone="warning">Nenhum mundo do Foundry está conectado a esta campanha.</Notice>;
  }
  if (targets.every((target) => target.blockedReason)) {
    return (
      <Notice tone="warning" title="Ainda não dá para enviar ao Foundry">
        <ul className="list-disc space-y-1 pl-5">
          {targets.map((target) => (
            <li key={target.worldId}>
              {target.worldTitle}: {blockedCopy[target.blockedReason!]}
              {target.blockedReason === "module_outdated" ? ` (versão registrada: ${target.moduleVersion})` : null}.
            </li>
          ))}
        </ul>
        {targets.some((target) => target.blockedReason === "module_outdated") ? (
          <p className="mt-2">
            Se o módulo já foi atualizado, entre no mundo como mestre: a partir do 0.8.1, a versão registrada se
            atualiza sozinha em até um minuto.
          </p>
        ) : null}
      </Notice>
    );
  }
  return null;
}

export function DrawEntriesTable({ draw }: Readonly<{ draw: MerchantStockDraw }>) {
  return (
    <DataTable
      caption="Itens sorteados"
      rows={draw.entries}
      rowKey={(entry) => entry.catalogItemId}
      columns={[
        {
          id: "name",
          header: "Item",
          hideLabelOnMobile: true,
          sortValue: (entry) => entry.name,
          cell: (entry) => (
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-fg">{entry.name}</p>
              <p className="text-xs text-fg-subtle">{entry.category}</p>
            </div>
          ),
        },
        {
          id: "availability",
          header: "Disponibilidade",
          className: "md:w-36",
          cell: (entry) => <Badge tone={availabilityTone[entry.availability]}>{availabilityLabel(entry.availability)}</Badge>,
        },
        {
          id: "combat",
          header: "Dano/Defesa",
          className: "md:w-36 text-fg-muted",
          cell: (entry) => combatSummary(entry),
        },
        {
          id: "handling",
          header: "Mãos/Requisito",
          className: "md:w-44 text-fg-muted",
          cell: (entry) => handlingSummary(entry),
        },
        {
          id: "properties",
          header: "Propriedades",
          className: "text-fg-muted",
          cell: (entry) => entry.properties ?? "—",
        },
        {
          id: "price",
          header: "Preço",
          className: "md:w-40",
          cell: (entry) => (entry.price ? priceLabel(entry.price) : "—"),
        },
        {
          id: "quantity",
          header: "Qtd.",
          className: "md:w-16 tabular-nums",
          sortValue: (entry) => entry.quantity,
          cell: (entry) => entry.quantity,
        },
      ]}
    />
  );
}
