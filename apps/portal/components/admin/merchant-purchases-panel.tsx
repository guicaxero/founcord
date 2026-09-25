"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MerchantPurchaseDecisionInput,
  MerchantPurchaseListResponse,
  MerchantPurchaseRequest,
  MerchantPurchaseStatus,
} from "@ordem/contracts";
import { motion } from "motion/react";
import { useRef, useState, type FormEvent } from "react";
import { PurchaseCard } from "@/components/merchant/purchase-card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Textarea } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { listItem, staggerList } from "@/components/ui/motion";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader, PanelLoading, Stats } from "./kit";

type Decision = "fulfill" | "reject";
type PurchaseFilter = "attention" | "all" | MerchantPurchaseStatus;
type Selection = Readonly<{ purchase: MerchantPurchaseRequest; decision: Decision }>;

const needsAttention = (purchase: MerchantPurchaseRequest) =>
  purchase.status === "pending_delivery" ||
  purchase.status === "awaiting_master" ||
  purchase.status === "delivery_failed";

export function MerchantPurchasesPanel({
  campaignId,
  pollingEnabled = true,
}: Readonly<{
  campaignId: string;
  pollingEnabled?: boolean;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const triggerRef = useRef<HTMLElement | null>(null);
  const [filter, setFilter] = useState<PurchaseFilter>("attention");
  const [selection, setSelection] = useState<Selection | null>(null);
  const purchases = useQuery({
    queryKey: queryKeys.merchantPurchases(campaignId),
    queryFn: () => apiFetch<MerchantPurchaseListResponse>(`/api/campaigns/${campaignId}/merchant/purchases`),
    refetchInterval: pollingEnabled
      ? (query) =>
          query.state.data?.data.some(
            (purchase) => purchase.status === "pending_delivery" || purchase.status === "awaiting_master",
          )
            ? 10_000
            : false
      : false,
  });
  const decide = useMutation({
    mutationFn: ({ purchaseId, input }: Readonly<{ purchaseId: string; input: MerchantPurchaseDecisionInput }>) =>
      apiFetch<MerchantPurchaseRequest>(`/api/campaigns/${campaignId}/merchant/purchases/${purchaseId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async (updated) => {
      setSelection(null);
      toast({
        title: updated.status === "fulfilled" ? "Pedido atendido" : "Pedido recusado",
        description: `${updated.item.quantity} × ${updated.item.name} para ${updated.character.actorName}.`,
        tone: updated.status === "fulfilled" ? "success" : "info",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.merchantPurchases(campaignId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) }),
      ]);
    },
  });

  if (purchases.isPending) return <PanelLoading label="Consultando pedidos do Mercador" />;
  if (purchases.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar os pedidos"
        tone="error"
        role="alert"
        action={<Button onClick={() => purchases.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(purchases.error)}
      </FeedbackState>
    );
  }

  const data = purchases.data.data;
  const count = (predicate: (purchase: MerchantPurchaseRequest) => boolean) => data.filter(predicate).length;
  const visible = data.filter((purchase) => {
    if (filter === "all") return true;
    if (filter === "attention") return needsAttention(purchase);
    return purchase.status === filter;
  });
  const awaiting = count((purchase) => purchase.status === "awaiting_master");

  function open(purchase: MerchantPurchaseRequest, decision: Decision, trigger: HTMLElement) {
    triggerRef.current = trigger;
    decide.reset();
    setSelection({ purchase, decision });
  }

  return (
    <div className="space-y-8">
      <Stats
        label="Resumo dos pedidos"
        items={[
          { label: "Aguardam o mestre", value: awaiting },
          { label: "Precisam de atenção", value: count(needsAttention) },
          { label: "Atendidos", value: count((purchase) => purchase.status === "fulfilled") },
        ]}
      />

      <Notice tone="info" title="O portal não movimenta moedas nem itens">
        Confira o pedido, faça a troca no Foundry e só depois registre a decisão aqui.
      </Notice>

      <section className="space-y-5" aria-labelledby="merchant-queue-title">
        <PanelHeader
          id="merchant-queue-title"
          eyebrow="Fila de pedidos"
          title="Pedidos enviados pelos jogadores"
          actions={purchases.isFetching ? <span className="text-xs text-fg-subtle" role="status">Atualizando…</span> : null}
        />
        <FilterChips
          label="Filtrar pedidos por estado"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "attention", label: "Precisam de atenção", count: count(needsAttention) },
            { value: "awaiting_master", label: "Aguardando mestre", count: awaiting },
            { value: "fulfilled", label: "Atendidos" },
            { value: "rejected", label: "Recusados" },
            { value: "cancelled", label: "Cancelados" },
            { value: "all", label: "Todos", count: data.length },
          ]}
        />

        {data.length === 0 ? (
          <FeedbackState title="Nenhum pedido recebido">
            Os pedidos de jogadores com personagem vinculado aparecem aqui e no chat privado dos mestres no Foundry.
          </FeedbackState>
        ) : visible.length === 0 ? (
          <FeedbackState
            title="Nenhum pedido neste filtro"
            action={<Button onClick={() => setFilter("all")}>Ver todos os pedidos</Button>}
          >
            Escolha outro estado para consultar o histórico.
          </FeedbackState>
        ) : (
          <motion.ul
            key={filter}
            className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
            aria-live="polite"
            variants={staggerList}
            initial="hidden"
            animate="visible"
          >
            {visible.map((purchase) => (
              <motion.li key={purchase.id} variants={listItem}>
                <PurchaseCard purchase={purchase}>
                  <p className="text-sm text-fg-muted">
                    Pedido por <strong className="text-fg">{purchase.requester.displayName}</strong>
                  </p>
                  {purchase.status === "awaiting_master" ? (
                    <div className="mt-auto flex flex-wrap gap-2 border-t border-line-soft pt-4">
                      <Button size="sm" onClick={(event) => open(purchase, "reject", event.currentTarget)}>
                        Recusar
                      </Button>
                      <Button size="sm" variant="primary" onClick={(event) => open(purchase, "fulfill", event.currentTarget)}>
                        Marcar como atendido
                      </Button>
                    </div>
                  ) : null}
                </PurchaseCard>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </section>

      <Dialog
        open={Boolean(selection)}
        onOpenChange={(next) => {
          if (!next && !decide.isPending) setSelection(null);
        }}
        title={selection?.decision === "fulfill" ? "Confirmar atendimento" : "Recusar pedido"}
        description={
          selection
            ? `${selection.purchase.character.actorName} pediu ${selection.purchase.item.quantity} × ${selection.purchase.item.name}.`
            : undefined
        }
        returnFocusRef={triggerRef}
        className="max-w-lg"
      >
        {selection ? (
          <DecisionForm
            selection={selection}
            busy={decide.isPending}
            error={decide.isError ? errorMessage(decide.error) : null}
            onCancel={() => setSelection(null)}
            onSubmit={(input) => decide.mutate({ purchaseId: selection.purchase.id, input })}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function DecisionForm({
  selection,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  selection: Selection;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: MerchantPurchaseDecisionInput) => void;
}>) {
  const fulfill = selection.decision === "fulfill";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      action: selection.decision,
      resolutionNote: String(form.get("resolutionNote") ?? "").trim() || null,
    });
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      {fulfill ? (
        <Notice tone="warning" role="note" title="Confirme só depois do acerto no Foundry">
          Esta ação registra o resultado, mas não altera a ficha nem o estoque.
        </Notice>
      ) : null}
      <Field label="Retorno para o jogador" optional>
        {({ id }) => (
          <Textarea
            id={id}
            name="resolutionNote"
            rows={4}
            maxLength={500}
            placeholder={fulfill ? "Ex.: item entregue e moedas ajustadas na ficha." : "Ex.: item reservado para outra expedição."}
          />
        )}
      </Field>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Voltar ao pedido</Button>
        <Button type="submit" variant={fulfill ? "primary" : "danger"} disabled={busy}>
          {busy ? "Registrando…" : fulfill ? "Confirmar atendimento" : "Recusar este pedido"}
        </Button>
      </div>
    </form>
  );
}
