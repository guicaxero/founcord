import { z } from "zod";

/**
 * Moedas do sistema Shadow of the Demon Lord (`actor.system.wealth` no Foundry).
 * 1 coroa de ouro = 10 xelins de prata = 100 centavos de cobre = 1.000 trocados.
 */
export const DEMON_LORD_COINS = ["gc", "ss", "cp", "bits"] as const;
export type DemonLordCoin = (typeof DEMON_LORD_COINS)[number];

const coinAmount = z.number().int().min(0).max(1_000_000_000);

export const DemonLordCoinsSchema = z
  .object({ gc: coinAmount, ss: coinAmount, cp: coinAmount, bits: coinAmount })
  .strict();

export type DemonLordCoins = z.infer<typeof DemonLordCoinsSchema>;

export const BITS_PER_COIN: Readonly<Record<DemonLordCoin, number>> = {
  gc: 1_000,
  ss: 100,
  cp: 10,
  bits: 1,
};

const COIN_NAMES: Readonly<Record<DemonLordCoin, Readonly<{ one: string; many: string }>>> = {
  gc: { one: "coroa de ouro", many: "coroas de ouro" },
  ss: { one: "xelim de prata", many: "xelins de prata" },
  cp: { one: "centavo de cobre", many: "centavos de cobre" },
  bits: { one: "trocado", many: "trocados" },
};

/** Rótulos para exibir o saldo, na ordem ouro → prata → cobre → trocados. */
export const COIN_LABELS: Readonly<Record<DemonLordCoin, string>> = {
  gc: "Coroas de ouro",
  ss: "Xelins de prata",
  cp: "Centavos de cobre",
  bits: "Trocados",
};

/** Aliases em português e inglês, já sem acentos e em minúsculas. */
const COIN_ALIASES: Readonly<Record<DemonLordCoin, readonly string[]>> = {
  gc: ["coroas de ouro", "coroa de ouro", "gold crowns", "gold crown", "coroas", "coroa", "gc", "gp", "co"],
  ss: [
    "xelins de prata",
    "xelim de prata",
    "silver shillings",
    "silver shilling",
    "xelins",
    "xelim",
    "ss",
    "sp",
    "xp",
  ],
  cp: [
    "centavos de cobre",
    "centavo de cobre",
    "copper pennies",
    "copper penny",
    "centavos",
    "centavo",
    "cp",
    "cc",
  ],
  bits: ["trocados", "trocado", "bits", "bit"],
};

const aliasToCoin = new Map<string, DemonLordCoin>(
  DEMON_LORD_COINS.flatMap((coin) => COIN_ALIASES[coin].map((alias) => [alias, coin] as const)),
);

const AMOUNT_WITH_COIN = new RegExp(
  `(\\d+)\\s*(${[...aliasToCoin.keys()]
    .sort((left, right) => right.length - left.length)
    .map((alias) => alias.replace(/\s+/g, "\\s+"))
    .join("|")})(?![a-z])`,
  "g",
);
const SEPARATORS = /[\s,;+]+|(?<![a-z])e(?![a-z])/g;

export const EMPTY_COINS: DemonLordCoins = { gc: 0, ss: 0, cp: 0, bits: 0 };

export type ParsedPrice = Readonly<{ coins: DemonLordCoins; totalBits: number }>;

/**
 * Interpreta o texto livre de preço do Foundry (`5 cp`, `2 gc e 5 ss`,
 * `3 xelins de prata`). Devolve `null` para preços especiais ou ambíguos, como
 * `2 gc e um favor` ou `5`, que devem ser exibidos como o mestre escreveu.
 */
export function parseDemonLordPrice(raw: string | null | undefined): ParsedPrice | null {
  if (!raw) return null;
  const normalized = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!normalized) return null;

  const coins = { ...EMPTY_COINS };
  let matched = false;
  const remainder = normalized.replace(AMOUNT_WITH_COIN, (_match, amount: string, alias: string) => {
    const coin = aliasToCoin.get(alias.replace(/\s+/g, " "));
    if (!coin) return _match;
    coins[coin] += Number(amount);
    matched = true;
    return " ";
  });
  if (!matched || remainder.replace(SEPARATORS, "").length > 0) return null;
  return { coins, totalBits: toBits(coins) };
}

export function toBits(coins: DemonLordCoins): number {
  return DEMON_LORD_COINS.reduce((total, coin) => total + coins[coin] * BITS_PER_COIN[coin], 0);
}

/** Converte um valor em trocados para a menor quantidade de moedas. */
export function fromBits(totalBits: number): DemonLordCoins {
  let remaining = Math.max(0, Math.trunc(totalBits));
  const coins = { ...EMPTY_COINS };
  for (const coin of DEMON_LORD_COINS) {
    coins[coin] = Math.floor(remaining / BITS_PER_COIN[coin]);
    remaining -= coins[coin] * BITS_PER_COIN[coin];
  }
  return coins;
}

/** Multiplica cada moeda pela quantidade, preservando as denominações do preço. */
export function multiplyCoins(coins: DemonLordCoins, quantity: number): DemonLordCoins {
  return {
    gc: coins.gc * quantity,
    ss: coins.ss * quantity,
    cp: coins.cp * quantity,
    bits: coins.bits * quantity,
  };
}

/** `2 coroas de ouro e 5 centavos de cobre`; valor zero vira `Gratuito`. */
export function formatCoins(coins: DemonLordCoins): string {
  const parts = DEMON_LORD_COINS.filter((coin) => coins[coin] > 0).map((coin) => {
    const amount = coins[coin];
    const name = amount === 1 ? COIN_NAMES[coin].one : COIN_NAMES[coin].many;
    return `${amount.toLocaleString("pt-BR")} ${name}`;
  });
  if (parts.length === 0) return "Gratuito";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

export type WealthAssessment =
  | Readonly<{ kind: "unknown" }>
  | Readonly<{ kind: "sufficient" }>
  | Readonly<{ kind: "insufficient"; shortfall: DemonLordCoins }>;

/** Compara o saldo registrado com um custo; `null` quando o saldo não foi sincronizado. */
export function assessWealth(
  wealth: DemonLordCoins | null | undefined,
  costBits: number,
): WealthAssessment {
  if (!wealth) return { kind: "unknown" };
  const shortfallBits = costBits - toBits(wealth);
  return shortfallBits > 0
    ? { kind: "insufficient", shortfall: fromBits(shortfallBits) }
    : { kind: "sufficient" };
}
