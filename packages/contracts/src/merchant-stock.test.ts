import { describe, expect, it } from "vitest";
import { FoundryCommandInputSchema } from "./foundry";
import {
  MerchantCatalogItemSchema,
  drawMerchantStock,
  moduleSupportsStockReplace,
  type MerchantCatalogItem,
  type MerchantStockCriteria,
} from "./merchant-stock";

const campaignId = "11111111-1111-4111-8111-111111111111";
let sequence = 0;

function item(overrides: Partial<MerchantCatalogItem> = {}): MerchantCatalogItem {
  sequence += 1;
  return MerchantCatalogItemSchema.parse({
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    campaignId,
    name: `Item ${sequence}`,
    category: "Equipamentos Pessoais",
    kind: "item",
    availability: "common",
    price: "1 cc",
    damage: null,
    hands: null,
    agility: null,
    fixed: null,
    requirement: null,
    properties: null,
    description: null,
    icon: null,
    source: "lojista",
    active: true,
    version: 1,
    createdAt: "2026-09-25T00:00:00.000Z",
    updatedAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  });
}

/** Sequência fixa de números aleatórios, repetida em ciclo. */
function sequenceRandom(values: readonly number[]) {
  let index = 0;
  return () => values[index++ % values.length]!;
}

const criteria = (overrides: Partial<MerchantStockCriteria> = {}): MerchantStockCriteria => ({
  maxAvailability: "exotic",
  categories: [],
  quantity: 10,
  allowRepeat: false,
  ...overrides,
});

describe("drawMerchantStock", () => {
  it("respeita o teto de disponibilidade: Incomum inclui Comum, mas não Raro", () => {
    const catalog = [
      item({ name: "Tocha", availability: "common" }),
      item({ name: "Lamparina", availability: "uncommon" }),
      item({ name: "Óculos", availability: "rare" }),
      item({ name: "Luneta", availability: "exotic" }),
    ];
    const result = drawMerchantStock(catalog, criteria({ maxAvailability: "uncommon" }));
    expect(result.eligibleCount).toBe(2);
    expect(result.entries.map((entry) => entry.name).sort()).toEqual(["Lamparina", "Tocha"]);
  });

  it("filtra categorias e ignora itens inativos ou sem preço", () => {
    const catalog = [
      item({ name: "Arco", category: "Armas à Distância", kind: "weapon" }),
      item({ name: "Mochila" }),
      item({ name: "Funda", category: "Armas à Distância", kind: "weapon", active: false }),
      item({ name: "Besta", category: "Armas à Distância", kind: "weapon", price: null }),
    ];
    const result = drawMerchantStock(catalog, criteria({ categories: ["Armas à Distância"] }));
    expect(result.eligibleCount).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ name: "Arco", quantity: 1, kind: "weapon" });
  });

  it("sem repetição, nunca repete e para no total de itens elegíveis", () => {
    const catalog = [item(), item(), item()];
    const result = drawMerchantStock(catalog, criteria({ quantity: 10 }));
    expect(result.entries).toHaveLength(3);
    expect(result.entries.every((entry) => entry.quantity === 1)).toBe(true);
    expect(new Set(result.entries.map((entry) => entry.catalogItemId)).size).toBe(3);
  });

  it("com repetição, soma a quantidade do mesmo item", () => {
    const first = item({ name: "Arco" });
    const second = item({ name: "Bola" });
    // 0 → Arco, 0.9 → Bola, 0 → Arco, 0 → Arco
    const result = drawMerchantStock([first, second], criteria({ quantity: 4, allowRepeat: true }), sequenceRandom([0, 0.9, 0, 0]));
    expect(result.entries.map((entry) => [entry.name, entry.quantity])).toEqual([
      ["Arco", 3],
      ["Bola", 1],
    ]);
  });

  it("é determinístico com a mesma fonte aleatória", () => {
    const catalog = Array.from({ length: 20 }, () => item());
    const random = () => sequenceRandom([0.13, 0.52, 0.77, 0.08, 0.41]);
    const first = drawMerchantStock(catalog, criteria({ quantity: 5 }), random());
    const second = drawMerchantStock(catalog, criteria({ quantity: 5 }), random());
    expect(first.entries.map((entry) => entry.catalogItemId)).toEqual(
      second.entries.map((entry) => entry.catalogItemId),
    );
  });

  it("devolve vazio quando nada é elegível", () => {
    expect(drawMerchantStock([item({ availability: "rare" })], criteria({ maxAvailability: "common" }))).toEqual({
      eligibleCount: 0,
      entries: [],
    });
  });
});

describe("contrato do comando de estoque", () => {
  it("aceita o estoque sorteado e recusa listas vazias", () => {
    const entry = drawMerchantStock([item({ name: "Adaga ou faca", kind: "weapon", damage: "1d3", hands: "off" })], criteria()).entries;
    const command = {
      type: "merchant.stock.replace",
      payload: {
        drawId: "22222222-2222-4222-8222-222222222222",
        campaignId,
        items: entry,
        requestedAt: "2026-09-25T00:00:00.000Z",
      },
    };
    expect(FoundryCommandInputSchema.parse(command).type).toBe("merchant.stock.replace");
    expect(() => FoundryCommandInputSchema.parse({ ...command, payload: { ...command.payload, items: [] } })).toThrow();
  });

  it("reconhece a versão mínima do módulo", () => {
    expect(moduleSupportsStockReplace("0.7.0")).toBe(false);
    expect(moduleSupportsStockReplace("0.8.0")).toBe(true);
    expect(moduleSupportsStockReplace("0.10.2")).toBe(true);
    expect(moduleSupportsStockReplace("1.0.0")).toBe(true);
  });
});
