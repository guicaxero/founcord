import { describe, expect, it } from "vitest";
import { SedeActivityInputSchema, SedeRollFormulaSchema, rollSede } from "./sede";

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
