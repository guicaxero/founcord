import { describe, expect, it } from "vitest";
import { FoundryCommandInputSchema } from "./foundry";
import { SedeActivityInputSchema, SedeRollFormulaSchema, moduleSupportsItemGrant, rollSede } from "./sede";

describe("Vida na Sede", () => {
  it("rola NdM com a fonte de aleatoriedade dada", () => {
    const values = [0, 0.999];
    const roll = rollSede("2d20", () => values.shift() ?? 0);
    expect(roll).toEqual({ formula: "2d20", dice: [1, 20], total: 21 });
  });

  it("aceita só fórmulas de dados conhecidas", () => {
    for (const ok of ["1d6", "2d20", "10d10", "1d100"]) expect(SedeRollFormulaSchema.safeParse(ok).success, ok).toBe(true);
    for (const bad of ["0d6", "2d7", "d20", "2d20+1", "100d6"]) {
      expect(SedeRollFormulaSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("aplica os padrões da atividade", () => {
    const activity = SedeActivityInputSchema.parse({
      npc: "Zelador",
      name: "Ajudar na Sede",
      description: "Arruma a Sede.",
      effect: "Role 2d20.",
      minLevel: 1,
    });
    expect(activity).toMatchObject({ inputMode: "none", roll: null, active: true, sort: 0 });
    expect(SedeActivityInputSchema.safeParse({ ...activity, minLevel: 5 }).success).toBe(false);
  });
});

describe("entrega dos itens do Lojista", () => {
  const entry = {
    catalogItemId: "11111111-1111-4111-8111-111111111111",
    name: "Corda",
    category: "Equipamentos Pessoais",
    kind: "item",
    availability: "common",
    price: "1 cc",
    quantity: 2,
  };
  const command = {
    type: "character.items.grant",
    payload: {
      grantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      campaignId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      actorId: "aster-001",
      items: [entry],
      requestedAt: "2026-10-03T12:00:00.000Z",
    },
  };

  it("aceita o comando com itens do catálogo", () => {
    const parsed = FoundryCommandInputSchema.parse(command);
    expect(parsed.type).toBe("character.items.grant");
  });

  it("recusa a entrega sem itens ou com ator inválido", () => {
    expect(FoundryCommandInputSchema.safeParse({ ...command, payload: { ...command.payload, items: [] } }).success).toBe(false);
    expect(FoundryCommandInputSchema.safeParse({ ...command, payload: { ...command.payload, actorId: "../x" } }).success).toBe(false);
  });

  it("exige o módulo 0.12.0 ou mais novo", () => {
    expect(moduleSupportsItemGrant("0.11.0")).toBe(false);
    expect(moduleSupportsItemGrant("0.12.0")).toBe(true);
  });
});
