"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  MerchantCatalogListResponse,
  MerchantStockDraw,
  MerchantStockDrawListResponse,
} from "@ordem/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Badge } from "@/components/ui/surface";
import { UrlTabs } from "@/components/ui/tabs";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelLoading } from "../kit";
import { timestamp } from "../status";
import { CatalogTab } from "./catalog-tab";
import { drawStatusContent, drawSummary } from "./presentation";
import { SelectionTab, type SelectedEntry } from "./selection-tab";
import { DrawEntriesTable, StockDrawTab } from "./stock-draw-tab";

/**
 * Estoque do Lojista: sorteio, seleção manual, catálogo e histórico. O estoque
 * só vira realidade quando o módulo cria os itens no ator do Foundry.
 */
export function MerchantStockPanel({ campaignId }: Readonly<{ campaignId: string }>) {
  return (
    // As abas leem a URL; o Suspense mantém a rota do painel pré-renderizável.
    <Suspense fallback={<PanelLoading label="Carregando o estoque do Lojista" />}>
      <MerchantStockTabs campaignId={campaignId} />
    </Suspense>
  );
}

function MerchantStockTabs({ campaignId }: Readonly<{ campaignId: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // A seleção sobrevive à troca de abas enquanto o painel estiver aberto.
  const [selection, setSelection] = useState<readonly SelectedEntry[]>([]);
  const catalog = useQuery({
    queryKey: queryKeys.merchantCatalog(campaignId),
    queryFn: () => apiFetch<MerchantCatalogListResponse>(`/api/campaigns/${campaignId}/merchant/catalog`),
  });

  if (catalog.isPending) return <PanelLoading label="Carregando o catálogo do Lojista" />;
  if (catalog.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar o catálogo"
        tone="error"
        role="alert"
        action={<Button onClick={() => catalog.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(catalog.error)}
      </FeedbackState>
    );
  }

  const openTab = (tab: "catalogo" | "selecao") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("aba", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const openCatalog = () => openTab("catalogo");
  const adjust = (draw: MerchantStockDraw) => {
    const active = new Set(catalog.data.data.filter((item) => item.active).map((item) => item.id));
    setSelection(
      draw.entries
        .filter((entry) => active.has(entry.catalogItemId))
        .map((entry) => ({ catalogItemId: entry.catalogItemId, quantity: entry.quantity })),
    );
    openTab("selecao");
  };

  return (
    <UrlTabs
      label="Seções do estoque do Lojista"
      tabs={[
        {
          value: "sorteio",
          label: "Sorteio",
          content: (
            <StockDrawTab
              campaignId={campaignId}
              catalog={catalog.data.data}
              onOpenCatalog={openCatalog}
              onAdjust={adjust}
            />
          ),
        },
        {
          value: "selecao",
          label: selection.length > 0 ? `Seleção (${selection.length})` : "Seleção",
          content: (
            <SelectionTab
              campaignId={campaignId}
              catalog={catalog.data.data}
              selection={selection}
              onSelectionChange={setSelection}
              onOpenCatalog={openCatalog}
            />
          ),
        },
        {
          value: "catalogo",
          label: `Catálogo (${catalog.data.data.filter((item) => item.active).length})`,
          content: <CatalogTab campaignId={campaignId} catalog={catalog.data.data} />,
        },
        {
          value: "historico",
          label: "Histórico",
          content: <DrawHistory campaignId={campaignId} />,
        },
      ]}
    />
  );
}

function DrawHistory({ campaignId }: Readonly<{ campaignId: string }>) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<MerchantStockDraw | null>(null);
  const draws = useQuery({
    queryKey: queryKeys.merchantStockDraws(campaignId),
    queryFn: () => apiFetch<MerchantStockDrawListResponse>(`/api/campaigns/${campaignId}/merchant/stock/draws`),
  });

  if (draws.isPending) return <PanelLoading label="Carregando o histórico de sorteios" />;
  if (draws.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar o histórico"
        tone="error"
        role="alert"
        action={<Button onClick={() => draws.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(draws.error)}
      </FeedbackState>
    );
  }

  return (
    <>
      <DataTable
        caption="Sorteios de estoque"
        rows={draws.data.data}
        rowKey={(draw) => draw.id}
        initialSort={{ column: "when", direction: "descending" }}
        empty={<FeedbackState title="Nenhum sorteio registrado">Os sorteios enviados ou em prévia aparecem aqui.</FeedbackState>}
        columns={[
          {
            id: "when",
            header: "Quando",
            className: "md:w-48 whitespace-nowrap text-fg-muted",
            sortValue: (draw) => timestamp(draw.createdAt),
            cell: (draw) => formatDateTime(draw.createdAt),
          },
          {
            id: "criteria",
            header: "Critérios",
            cell: (draw) => (
              <div className="space-y-1">
                <p className="text-fg">{drawSummary(draw)}</p>
                <p className="text-xs text-fg-subtle">por {draw.createdByName}</p>
              </div>
            ),
          },
          {
            id: "status",
            header: "Situação",
            className: "md:w-44",
            cell: (draw) => <Badge tone={drawStatusContent[draw.status].tone}>{drawStatusContent[draw.status].label}</Badge>,
          },
          {
            id: "items",
            header: "Itens",
            hideLabelOnMobile: true,
            className: "md:w-40",
            cell: (draw) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setOpen(draw);
                }}
              >
                Ver {draw.entries.length} {draw.entries.length === 1 ? "item" : "itens"}
              </Button>
            ),
          },
        ]}
      />
      <Dialog
        open={Boolean(open)}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        title="Itens do sorteio"
        description={open ? `${drawSummary(open)} · ${formatDateTime(open.createdAt)}` : undefined}
        returnFocusRef={triggerRef}
        className="max-w-5xl"
      >
        {open ? <DrawEntriesTable draw={open} /> : null}
      </Dialog>
    </>
  );
}
