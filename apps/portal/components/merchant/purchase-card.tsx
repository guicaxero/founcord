import type { MerchantPurchaseRequest, MerchantPurchaseStatus } from "@ordem/contracts";
import type { ReactNode } from "react";
import { priceLabel, totalCostLabel } from "@/components/coins";
import { Badge, Card } from "@/components/ui/surface";
import { formatDateTime } from "@/lib/format";

export const purchaseStatusContent: Readonly<
  Record<
    MerchantPurchaseStatus,
    Readonly<{ label: string; description: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }>
  >
> = {
  pending_delivery: {
    label: "Enviando ao Foundry",
    description: "O pedido foi registrado e aguarda entrega ao mundo.",
    tone: "info",
  },
  awaiting_master: {
    label: "Aguardando o mestre",
    description: "Os mestres foram avisados. Nenhuma moeda ou item foi alterado.",
    tone: "warning",
  },
  delivery_failed: {
    label: "Aviso não entregue",
    description: "O pedido continua registrado no portal para a equipe consultar.",
    tone: "danger",
  },
  fulfilled: {
    label: "Atendido",
    description: "Um mestre confirmou que realizou o acerto manualmente.",
    tone: "success",
  },
  rejected: {
    label: "Recusado",
    description: "Um mestre encerrou o pedido sem atendimento.",
    tone: "neutral",
  },
  cancelled: {
    label: "Cancelado",
    description: "O pedido foi cancelado antes da decisão do mestre.",
    tone: "neutral",
  },
};

export function PurchaseCard({
  purchase,
  children,
}: Readonly<{ purchase: MerchantPurchaseRequest; children?: ReactNode }>) {
  const status = purchaseStatusContent[purchase.status];
  const total = totalCostLabel(purchase.item.price, purchase.item.quantity);

  return (
    <Card className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wider text-fg-subtle uppercase">
            {purchase.character.actorName}
          </p>
          <h3 className="font-display text-xl leading-tight break-words">
            {purchase.item.name}
          </h3>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-3 border-y border-line-soft py-3 text-sm">
        <div>
          <dt className="text-xs font-bold text-fg-subtle uppercase">Quantidade</dt>
          <dd className="font-semibold">{purchase.item.quantity}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-fg-subtle uppercase">Preço por unidade</dt>
          <dd className="font-semibold">{priceLabel(purchase.item.price)}</dd>
        </div>
        {total ? (
          <div>
            <dt className="text-xs font-bold text-fg-subtle uppercase">Custo total</dt>
            <dd className="font-semibold">{total}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-bold text-fg-subtle uppercase">Solicitado em</dt>
          <dd className="font-semibold">
            <time dateTime={purchase.createdAt}>{formatDateTime(purchase.createdAt)}</time>
          </dd>
        </div>
      </dl>

      <p className="text-sm text-fg-muted">{status.description}</p>
      {purchase.note ? (
        <p className="text-sm text-fg-muted">
          <strong className="text-fg">Observação:</strong> {purchase.note}
        </p>
      ) : null}
      {purchase.deliveryError ? (
        <p
          className="border-l-2 border-danger bg-danger-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {purchase.deliveryError}
        </p>
      ) : null}
      {purchase.resolutionNote ? (
        <p className="text-sm text-fg-muted">
          <strong className="text-fg">Retorno do mestre:</strong> {purchase.resolutionNote}
        </p>
      ) : null}

      {children ? (
        <footer className="mt-auto flex flex-wrap justify-end gap-2 border-t border-line-soft pt-3">
          {children}
        </footer>
      ) : null}
    </Card>
  );
}
