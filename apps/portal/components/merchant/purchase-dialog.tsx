"use client";

import {
  assessWealth,
  formatCoins,
  multiplyCoins,
  parseDemonLordPrice,
  type DemonLordCoins,
  type MerchantItemProjection,
  type MerchantPurchaseRequestInput,
} from "@ordem/contracts";
import { useState, type FormEvent, type RefObject } from "react";
import { CoinPurse, priceLabel } from "@/components/coins";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

/** Pedido assistido: revisa item, quantidade, custo e saldo antes de enviar. */
export function PurchaseDialog({
  item,
  characterName,
  characterWealth,
  requestId,
  busy,
  error,
  onClose,
  onSubmit,
  returnFocusRef,
}: Readonly<{
  returnFocusRef?: RefObject<HTMLElement | null>;
  item: MerchantItemProjection | null;
  characterName: string | null;
  characterWealth: DemonLordCoins | null;
  requestId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: MerchantPurchaseRequestInput) => void;
}>) {
  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={item ? `Solicitar ${item.name}` : ""}
      description="Revise o pedido que será enviado aos mestres da campanha."
      returnFocusRef={returnFocusRef}
    >
      {item ? (
        <PurchaseForm
          key={requestId}
          item={item}
          characterName={characterName}
          characterWealth={characterWealth}
          requestId={requestId}
          busy={busy}
          error={error}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

function PurchaseForm({
  item,
  characterName,
  characterWealth,
  requestId,
  busy,
  error,
  onClose,
  onSubmit,
}: Readonly<{
  item: MerchantItemProjection;
  characterName: string | null;
  characterWealth: DemonLordCoins | null;
  requestId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: MerchantPurchaseRequestInput) => void;
}>) {
  const maxQuantity = Math.min(item.quantity ?? 1, 99);
  // Última quantidade válida: valores fora do intervalo não alteram o custo exibido.
  const [quantity, setQuantity] = useState(1);
  const price = item.price ?? "";
  const parsedPrice = parseDemonLordPrice(price);
  const cost = parsedPrice ? multiplyCoins(parsedPrice.coins, quantity) : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      requestId,
      itemId: item.itemId,
      quantity: Number(form.get("quantity")),
      note: String(form.get("note") ?? "").trim() || null,
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-line-soft bg-surface-2 p-3">
          <dt className="text-xs font-bold text-fg-subtle uppercase">Personagem</dt>
          <dd className="font-semibold">{characterName}</dd>
        </div>
        <div className="rounded-md border border-line-soft bg-surface-2 p-3">
          <dt className="text-xs font-bold text-fg-subtle uppercase">Preço por unidade</dt>
          <dd className="font-semibold">{priceLabel(price)}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <label className="block text-sm font-semibold" htmlFor="purchase-quantity">
          Quantidade
        </label>
        <input
          id="purchase-quantity"
          name="quantity"
          type="number"
          min="1"
          max={maxQuantity}
          defaultValue="1"
          required
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isInteger(next) && next >= 1 && next <= maxQuantity) setQuantity(next);
          }}
          className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        <p className="text-xs text-fg-subtle">
          Até {maxQuantity} unidade{maxQuantity === 1 ? "" : "s"} no estoque atual.
        </p>
      </div>

      <div
        className="rounded-md border border-line-strong bg-surface p-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="text-xs font-bold text-fg-subtle uppercase">Custo total</p>
        {cost ? (
          <strong className="font-display text-2xl">{formatCoins(cost)}</strong>
        ) : (
          <p className="text-sm text-fg-muted">O custo depende do acerto com o mestre.</p>
        )}
      </div>

      <section className="space-y-3" aria-labelledby="purchase-wealth-title">
        <h3 className="text-sm font-semibold" id="purchase-wealth-title">
          Saldo registrado{characterName ? ` de ${characterName}` : ""}
        </h3>
        {characterWealth ? (
          <CoinPurse wealth={characterWealth} label="Moedas registradas no Foundry" />
        ) : null}
        <div aria-live="polite">
          <WealthAssessment
            wealth={characterWealth}
            costBits={parsedPrice ? parsedPrice.totalBits * quantity : null}
          />
        </div>
      </section>

      <div className="space-y-2">
        <label className="block text-sm font-semibold" htmlFor="purchase-note">
          Observação para o mestre <span className="font-normal text-fg-subtle">(opcional)</span>
        </label>
        <textarea
          id="purchase-note"
          name="note"
          rows={4}
          maxLength={500}
          placeholder="Exemplo: gostaria de retirar antes da próxima missão."
          className="w-full resize-y rounded-md border border-line bg-surface p-3 text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </div>

      <div className="border-l-2 border-warning bg-warning-soft px-4 py-3" role="note">
        <strong className="block text-sm">Nenhuma moeda ou item será alterado agora.</strong>
        <span className="text-sm text-fg-muted">
          O mestre recebe o pedido e confirma o acerto depois de realizá-lo no Foundry.
        </span>
      </div>

      {error ? (
        <p
          className="border-l-2 border-danger bg-danger-soft px-4 py-3 text-sm font-semibold text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Voltar ao catálogo
        </Button>
        <Button variant="accent" type="submit" disabled={busy}>
          {busy ? "Enviando pedido…" : "Enviar pedido ao mestre"}
        </Button>
      </div>
    </form>
  );
}

/** Avaliação informativa do saldo; nunca impede o envio do pedido. */
function WealthAssessment({
  wealth,
  costBits,
}: Readonly<{ wealth: DemonLordCoins | null; costBits: number | null }>) {
  const base = "border-l-2 px-4 py-3 text-sm";

  if (!wealth) {
    return (
      <p className={cn(base, "border-info bg-info-soft text-fg-muted")}>
        O saldo deste personagem ainda não foi sincronizado pelo Foundry.
      </p>
    );
  }
  if (costBits === null) return null;

  const assessment = assessWealth(wealth, costBits);
  if (assessment.kind === "insufficient") {
    return (
      <p className={cn(base, "border-warning bg-warning-soft")}>
        <strong className="block">
          O saldo registrado parece insuficiente: faltam {formatCoins(assessment.shortfall)}.
        </strong>
        <span className="text-fg-muted">
          Você ainda pode enviar o pedido; o mestre decide o acerto.
        </span>
      </p>
    );
  }
  return (
    <p className={cn(base, "border-success bg-success-soft text-fg-muted")}>
      O saldo registrado cobre este pedido.
    </p>
  );
}
