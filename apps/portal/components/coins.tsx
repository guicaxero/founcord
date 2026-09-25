import {
  COIN_LABELS,
  DEMON_LORD_COINS,
  formatCoins,
  isBareAmount,
  multiplyCoins,
  parseDemonLordPrice,
  type DemonLordCoin,
  type DemonLordCoins,
} from "@ordem/contracts";
import { cn } from "@/lib/cn";

/** Marca metálica de cada moeda; o rótulo continua carregando o significado. */
const coinDot: Readonly<Record<DemonLordCoin, string>> = {
  gc: "bg-gold",
  ss: "bg-silver",
  cp: "bg-copper",
  bits: "bg-fg-subtle",
};

/** Saldo do personagem: as quatro moedas, sempre na mesma ordem, inclusive zeros. */
export function CoinPurse({
  wealth,
  label,
  className,
}: Readonly<{ wealth: DemonLordCoins; label: string; className?: string }>) {
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line-soft bg-line-soft sm:grid-cols-4",
        className,
      )}
    >
      {DEMON_LORD_COINS.map((coin) => (
        <div className="grid grid-rows-[1fr_auto] gap-1 bg-surface p-3 text-center" key={coin}>
          <dt className="flex items-center justify-center gap-1.5 text-xs font-bold text-fg-subtle">
            <span aria-hidden="true" className={cn("size-2 rounded-full", coinDot[coin])} />
            {COIN_LABELS[coin]}
          </dt>
          <dd className="font-display text-xl font-bold">
            {wealth[coin].toLocaleString("pt-BR")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Preço do catálogo em nomes completos (`5 centavos de cobre`), com o texto do
 * mestre como referência secundária. Preços especiais aparecem como escritos.
 */
export function MerchantPrice({ price }: Readonly<{ price: string | null }>) {
  if (!price) {
    return <span className="text-sm text-fg-subtle italic">Preço não informado</span>;
  }
  const parsed = parseDemonLordPrice(price);
  if (!parsed && isBareAmount(price)) {
    return (
      <span className="grid gap-0.5">
        <strong className="font-display text-base">{price.trim()}</strong>
        <span className="text-xs text-warning">Moeda não informada no Foundry</span>
      </span>
    );
  }
  if (!parsed) {
    return (
      <span className="grid gap-0.5">
        <strong className="font-display text-base">{price}</strong>
        <span className="text-xs text-fg-subtle">Preço combinado com o mestre</span>
      </span>
    );
  }
  const formatted = formatCoins(parsed.coins);
  return (
    <span className="grid gap-0.5">
      <strong className="font-display text-base">{formatted}</strong>
      {formatted !== price ? (
        <span className="text-xs text-fg-subtle">Registrado como {price}</span>
      ) : null}
    </span>
  );
}

/** Texto do preço para listas compactas; preços especiais permanecem como escritos. */
export function priceLabel(price: string): string {
  const parsed = parseDemonLordPrice(price);
  return parsed ? formatCoins(parsed.coins) : price;
}

/** Custo total mantendo as denominações do preço, ou `null` para preço especial. */
export function totalCostLabel(price: string, quantity: number): string | null {
  const parsed = parseDemonLordPrice(price);
  return parsed ? formatCoins(multiplyCoins(parsed.coins, quantity)) : null;
}
