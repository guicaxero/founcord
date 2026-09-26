import { describe, expect, it } from "vitest";
import {
  assessWealth,
  formatCoins,
  fromBits,
  multiplyCoins,
  formatParsedPrice,
  parseDemonLordPrice,
  toBits,
} from "./currency";

const coins = (gc = 0, ss = 0, cp = 0, bits = 0) => ({ gc, ss, cp, bits });

describe("parseDemonLordPrice", () => {
  it.each([
    ["5 cp", coins(0, 0, 5), 50],
    ["1 gc", coins(1), 1_000],
    ["2 SS 5 CP", coins(0, 2, 5), 250],
    ["2 gc e 5 ss", coins(2, 5), 2_500],
    ["1 gc, 2 ss + 3 cp; 4 bits", coins(1, 2, 3, 4), 1_234],
    ["3 xelins de prata", coins(0, 3), 300],
    ["1 Coroa de Ouro", coins(1), 1_000],
    ["10 trocados", coins(0, 0, 0, 10), 10],
    ["5 xp", coins(0, 5), 500],
    ["2 cc", coins(0, 0, 2), 20],
    ["4 co", coins(4), 4_000],
    ["1 gold crown", coins(1), 1_000],
    ["2 copper pennies", coins(0, 0, 2), 20],
    ["5cp", coins(0, 0, 5), 50],
    ["0 cp", coins(), 0],
  ])("interpreta %s", (raw, expected, totalBits) => {
    expect(parseDemonLordPrice(raw)).toEqual({ coins: expected, totalBits, minimum: false });
  });

  it("marca preços com + como mínimos", () => {
    expect(parseDemonLordPrice("1 xp+")).toEqual({ coins: coins(0, 1), totalBits: 100, minimum: true });
    expect(parseDemonLordPrice("5 cc +")?.minimum).toBe(true);
    expect(formatParsedPrice(parseDemonLordPrice("2 xp+")!)).toBe("a partir de 2 xelins de prata");
    expect(formatParsedPrice(parseDemonLordPrice("1 cc")!, 3)).toBe("3 centavos de cobre");
  });

  it.each(["2 gc e um favor", "5", "a combinar", "", "   ", "1.000 bits", "5 cpx", "cp 5"])(
    "trata %j como preço especial",
    (raw) => {
      expect(parseDemonLordPrice(raw)).toBeNull();
    },
  );

  it("aceita nulo", () => {
    expect(parseDemonLordPrice(null)).toBeNull();
  });
});

describe("formatação e conversões", () => {
  it("formata com nomes completos, plural e conjunção", () => {
    expect(formatCoins(coins(0, 0, 5))).toBe("5 centavos de cobre");
    expect(formatCoins(coins(1))).toBe("1 coroa de ouro");
    expect(formatCoins(coins(2, 0, 5))).toBe("2 coroas de ouro e 5 centavos de cobre");
    expect(formatCoins(coins(0, 1, 3, 4))).toBe(
      "1 xelim de prata, 3 centavos de cobre e 4 trocados",
    );
    expect(formatCoins(coins())).toBe("Gratuito");
    expect(formatCoins(coins(1_500))).toBe("1.500 coroas de ouro");
  });

  it("converte entre moedas e trocados", () => {
    expect(toBits(coins(1, 2, 3, 4))).toBe(1_234);
    expect(fromBits(1_234)).toEqual(coins(1, 2, 3, 4));
    expect(fromBits(50)).toEqual(coins(0, 0, 5));
  });

  it("multiplica preservando as denominações", () => {
    expect(multiplyCoins(coins(0, 0, 5), 3)).toEqual(coins(0, 0, 15));
  });
});

describe("assessWealth", () => {
  it("identifica saldo desconhecido, suficiente e insuficiente", () => {
    expect(assessWealth(null, 150)).toEqual({ kind: "unknown" });
    expect(assessWealth(coins(1), 150)).toEqual({ kind: "sufficient" });
    expect(assessWealth(coins(0, 1), 150)).toEqual({
      kind: "insufficient",
      shortfall: coins(0, 0, 5),
    });
  });
});
