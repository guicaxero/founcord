import {
  COIN_LABELS,
  DEMON_LORD_COINS,
  formatCoins,
  multiplyCoins,
  parseDemonLordPrice,
  type DemonLordCoins,
} from "@ordem/contracts";

/** Saldo do personagem: as quatro moedas, sempre na mesma ordem, inclusive zeros. */
export function CoinPurse({
  wealth,
  label,
}: Readonly<{ wealth: DemonLordCoins; label: string }>) {
  return (
    <dl className="coin-purse" aria-label={label}>
      {DEMON_LORD_COINS.map((coin) => (
        <div className={`coin-purse-${coin}`} key={coin}>
          <dt>{COIN_LABELS[coin]}</dt>
          <dd>{wealth[coin].toLocaleString("pt-BR")}</dd>
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
  if (!price) return <span className="merchant-unavailable">Preço não informado</span>;
  const parsed = parseDemonLordPrice(price);
  if (!parsed) {
    return (
      <span className="merchant-price">
        <strong>{price}</strong>
        <span className="merchant-price-source">Preço combinado com o mestre</span>
      </span>
    );
  }
  const formatted = formatCoins(parsed.coins);
  return (
    <span className="merchant-price">
      <strong>{formatted}</strong>
      {formatted !== price ? (
        <span className="merchant-price-source">Registrado como {price}</span>
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
