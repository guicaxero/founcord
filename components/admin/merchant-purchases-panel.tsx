"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MerchantPurchaseDecisionInput,
  MerchantPurchaseListResponse,
  MerchantPurchaseRequest,
  MerchantPurchaseStatus,
} from "@vigilia/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PurchaseCard } from "@/components/merchant-catalog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

type Decision = "fulfill" | "reject";
type PurchaseFilter = "attention" | "all" | MerchantPurchaseStatus;

export function MerchantPurchasesPanel({
  campaignId,
  pollingEnabled = true,
}: Readonly<{
  campaignId: string;
  pollingEnabled?: boolean;
}>) {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<PurchaseFilter>("attention");
  const [selection, setSelection] = useState<Readonly<{
    purchase: MerchantPurchaseRequest;
    decision: Decision;
  }> | null>(null);
  const [success, setSuccess] = useState("");
  const purchases = useQuery({
    queryKey: queryKeys.merchantPurchases(campaignId),
    queryFn: () => apiFetch<MerchantPurchaseListResponse>(
      `/api/campaigns/${campaignId}/merchant/purchases`,
    ),
    refetchInterval: pollingEnabled ? (query) => query.state.data?.data.some((purchase) =>
      purchase.status === "pending_delivery" || purchase.status === "awaiting_master",
    ) ? 10_000 : false : false,
  });
  const decide = useMutation({
    mutationFn: ({ purchaseId, input }: Readonly<{
      purchaseId: string;
      input: MerchantPurchaseDecisionInput;
    }>) => apiFetch<MerchantPurchaseRequest>(
      `/api/campaigns/${campaignId}/merchant/purchases/${purchaseId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
    onSuccess: async (updated) => {
      dialogRef.current?.close();
      setSelection(null);
      setSuccess(updated.status === "fulfilled"
        ? `Pedido de ${updated.item.name} marcado como atendido.`
        : `Pedido de ${updated.item.name} recusado.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.merchantPurchases(campaignId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) }),
      ]);
    },
  });

  useEffect(() => {
    if (selection && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [selection]);

  if (purchases.isPending) {
    return <div className="admin-loading" role="status"><span className="loading-line" /><p>Consultando pedidos do Mercador…</p></div>;
  }
  if (purchases.isError) {
    return <FeedbackState title="Não foi possível carregar os pedidos" tone="error" role="alert" action={<button className="secondary-action" type="button" onClick={() => purchases.refetch()}>Tentar novamente</button>}>{errorMessage(purchases.error)}</FeedbackState>;
  }

  const data = purchases.data?.data ?? [];
  const visible = data.filter((purchase) => {
    if (filter === "all") return true;
    if (filter === "attention") return purchase.status === "pending_delivery"
      || purchase.status === "awaiting_master"
      || purchase.status === "delivery_failed";
    return purchase.status === filter;
  });
  const awaiting = data.filter((purchase) => purchase.status === "awaiting_master").length;

  return (
    <div className="merchant-management">
      <section className="merchant-management-overview" aria-labelledby="merchant-management-title">
        <div><span className="admin-eyebrow">Acerto manual</span><h2 id="merchant-management-title">Pedidos enviados pelos jogadores</h2><p>Confira o pedido, realize a troca no Foundry e somente depois registre a decisão. O portal não movimenta moedas, itens ou estoque.</p></div>
        <div className="merchant-management-metric"><strong>{awaiting}</strong><span>{awaiting === 1 ? "pedido aguarda ação" : "pedidos aguardam ação"}</span></div>
      </section>

      {success ? <p className="inline-success" role="status">{success}</p> : null}
      {purchases.isFetching ? <p className="sessions-refresh-note" role="status">Atualizando pedidos…</p> : null}

      <div className="merchant-management-filters" role="group" aria-label="Filtrar pedidos por estado">
        {([
          ["attention", "Precisam de atenção"],
          ["awaiting_master", "Aguardando mestre"],
          ["fulfilled", "Atendidos"],
          ["rejected", "Recusados"],
          ["cancelled", "Cancelados"],
          ["all", "Todos"],
        ] as const).map(([value, label]) => (
          <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>

      {data.length === 0 ? (
        <FeedbackState title="Nenhum pedido recebido">Os pedidos feitos por jogadores vinculados aparecerão aqui e no chat privado dos mestres no Foundry.</FeedbackState>
      ) : visible.length === 0 ? (
        <FeedbackState title="Nenhum pedido neste filtro" action={<button className="secondary-action" type="button" onClick={() => setFilter("attention")}>Ver os que precisam de atenção</button>}>Escolha outro estado para consultar o histórico.</FeedbackState>
      ) : (
        <div className="merchant-management-list" aria-live="polite">
          {visible.map((purchase) => (
            <PurchaseCard purchase={purchase} key={purchase.id}>
              <span className="merchant-requester">Pedido por <strong>{purchase.requester.displayName}</strong></span>
              {purchase.status === "awaiting_master" ? (
                <div className="merchant-management-actions">
                  <button className="secondary-action" type="button" onClick={() => { decide.reset(); setSelection({ purchase, decision: "reject" }); }}>Recusar pedido</button>
                  <button className="admin-primary" type="button" onClick={() => { decide.reset(); setSelection({ purchase, decision: "fulfill" }); }}>Marcar como atendido</button>
                </div>
              ) : null}
            </PurchaseCard>
          ))}
        </div>
      )}

      {selection ? (
        <dialog className="merchant-decision-dialog" ref={dialogRef} aria-labelledby="merchant-decision-title" onClose={() => { if (!decide.isPending) setSelection(null); }}>
          <form onSubmit={(event) => submitDecision(event, selection, decide.mutate)}>
            <header><span className="admin-eyebrow">Decisão do mestre</span><h2 id="merchant-decision-title">{selection.decision === "fulfill" ? "Confirmar atendimento" : "Recusar pedido"}</h2><p>{selection.purchase.character.actorName} pediu {selection.purchase.item.quantity} × {selection.purchase.item.name}.</p></header>
            {selection.decision === "fulfill" ? <div className="merchant-no-mutation" role="note"><strong>Confirme somente depois do acerto no Foundry.</strong><span>Esta ação registra o resultado, mas não altera a ficha nem o estoque.</span></div> : null}
            <label><span>Retorno para o jogador <small>(opcional)</small></span><textarea name="resolutionNote" rows={4} maxLength={500} placeholder={selection.decision === "reject" ? "Exemplo: item reservado para outra expedição." : "Exemplo: item entregue e moedas ajustadas na ficha."} /></label>
            {decide.isError ? <p className="inline-error" role="alert">{errorMessage(decide.error)}</p> : null}
            <footer><button className="secondary-action" type="button" disabled={decide.isPending} onClick={() => dialogRef.current?.close()}>Voltar ao pedido</button><button className={selection.decision === "fulfill" ? "admin-primary" : "admin-danger"} type="submit" disabled={decide.isPending}>{decide.isPending ? "Registrando decisão…" : selection.decision === "fulfill" ? "Confirmar atendimento manual" : "Recusar este pedido"}</button></footer>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}

function submitDecision(
  event: FormEvent<HTMLFormElement>,
  selection: Readonly<{ purchase: MerchantPurchaseRequest; decision: Decision }>,
  mutate: (variables: Readonly<{ purchaseId: string; input: MerchantPurchaseDecisionInput }>) => void,
) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  mutate({
    purchaseId: selection.purchase.id,
    input: {
      action: selection.decision,
      resolutionNote: String(form.get("resolutionNote") ?? "").trim() || null,
    },
  });
}
