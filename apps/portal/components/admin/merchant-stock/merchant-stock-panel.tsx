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
import { criteriaSummary, drawStatusContent } from "./presentation";
import { DrawEntriesTable, StockDrawTab } from "./stock-draw-tab";

/**
 * Estoque do Lojista: catálogo de itens, sorteio e histórico. O sorteio só
 * vira estoque de verdade quando o módulo cria os itens no ator do Foundry.
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

  const openCatalog = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("aba", "catalogo");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <UrlTabs
      label="Seções do estoque do Lojista"
      tabs={[
        {
          value: "sorteio",
          label: "Sorteio",
          content: <StockDrawTab campaignId={campaignId} catalog={catalog.data.data} onOpenCatalog={openCatalog} />,
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
                <p className="text-fg">{criteriaSummary(draw.criteria)}</p>
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
        description={open ? `${criteriaSummary(open.criteria)} · ${formatDateTime(open.createdAt)}` : undefined}
        returnFocusRef={triggerRef}
        className="max-w-5xl"
      >
        {open ? <DrawEntriesTable draw={open} /> : null}
      </Dialog>
    </>
  );
}
