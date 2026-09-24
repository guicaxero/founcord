"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MerchantPurchaseDecisionInput,
  MerchantPurchaseListResponse,
  MerchantPurchaseRequest,
} from "@ordem/contracts";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { listItem, staggerList } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/surface";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { PurchaseCard } from "@/components/merchant-catalog";

/**
 * Pedidos do próprio jogador. Usado tanto na página do Mercador quanto na área
 * do jogador, sempre com escopo `self`: ninguém vê o pedido de outra pessoa.
 */
export function MyPurchaseRequests({
  campaignId,
  pollingEnabled = true,
}: Readonly<{ campaignId: string; pollingEnabled?: boolean }>) {
  const queryClient = useQueryClient();
  const purchases = useQuery({
    queryKey: [...queryKeys.merchantPurchases(campaignId), "self"],
    queryFn: () =>
      apiFetch<MerchantPurchaseListResponse>(
        `/api/campaigns/${campaignId}/merchant/purchases?scope=self`,
      ),
    // Enquanto houver pedido em trânsito, acompanha de perto; depois, para.
    refetchInterval: pollingEnabled
      ? (query) =>
          query.state.data?.data.some(
            (purchase) =>
              purchase.status === "pending_delivery" || purchase.status === "awaiting_master",
          )
            ? 10_000
            : false
      : false,
  });
  const cancelPurchase = useMutation({
    mutationFn: ({
      purchaseId,
      input,
    }: Readonly<{ purchaseId: string; input: MerchantPurchaseDecisionInput }>) =>
      apiFetch<MerchantPurchaseRequest>(
        `/api/campaigns/${campaignId}/merchant/purchases/${purchaseId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchantPurchases(campaignId) });
    },
  });

  if (purchases.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Consultando seus pedidos">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  if (purchases.isError) {
    return (
      <FeedbackState
        title="Não foi possível consultar seus pedidos"
        tone="error"
        role="alert"
        action={
          <Button variant="secondary" onClick={() => purchases.refetch()}>
            Tentar novamente
          </Button>
        }
      >
        {errorMessage(purchases.error)}
      </FeedbackState>
    );
  }

  const data = purchases.data?.data ?? [];
  if (data.length === 0) {
    return (
      <FeedbackState title="Nenhum pedido enviado">
        Quando você solicitar um item do Mercador, o andamento aparece aqui.
      </FeedbackState>
    );
  }

  return (
    <>
      <motion.div
        className="merchant-purchase-list"
        variants={staggerList}
        initial="hidden"
        animate="visible"
      >
        {data.map((purchase) => (
          <motion.div key={purchase.id} variants={listItem}>
            <PurchaseCard purchase={purchase}>
              {canCancelPurchase(purchase) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={cancelPurchase.isPending && cancelPurchase.variables?.purchaseId === purchase.id}
                  onClick={() =>
                    cancelPurchase.mutate({
                      purchaseId: purchase.id,
                      input: { action: "cancel", resolutionNote: null },
                    })
                  }
                >
                  {cancelPurchase.isPending && cancelPurchase.variables?.purchaseId === purchase.id
                    ? "Cancelando…"
                    : "Cancelar pedido"}
                </Button>
              ) : null}
            </PurchaseCard>
          </motion.div>
        ))}
      </motion.div>
      {cancelPurchase.isError ? (
        <p className="merchant-dialog-error" role="alert">
          {errorMessage(cancelPurchase.error)}
        </p>
      ) : null}
    </>
  );
}

function canCancelPurchase(purchase: MerchantPurchaseRequest): boolean {
  return (
    purchase.status === "pending_delivery" ||
    purchase.status === "awaiting_master" ||
    purchase.status === "delivery_failed"
  );
}
