import { describe, expect, it } from "vitest";
import { CharacterSheetSchema, MAX_CHARACTER_SHEET_CHARS, type CharacterSheet } from "./character-sheet";
import { FoundryCharacterProjectionSchema, FoundryCommandInputSchema } from "./foundry";

function sheet(overrides: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    attributes: { strength: 10, agility: 10, intellect: 10, will: 10, perception: 10 },
    characteristics: { defense: 10, speed: 10, power: 0, size: "1", fortune: 0 },
    appearance: { age: null, sex: null, eyes: null, hair: null, height: null, weight: null, feature: null },
    religion: null,
    inventory: [],
    spells: [],
    talents: [],
    roots: { ancestry: null, professions: [], languages: [] },
    notes: { text: "", revision: "0" },
    ...overrides,
  };
}

const projection = {
  actorId: "aster-001",
  name: "Aster",
  type: "character",
  ownerUserIds: [],
  level: 1,
  ancestry: null,
  paths: { novice: null, expert: null, master: null, legendary: null },
  statistics: { healthMax: 10, damage: 0, healingRate: 2, insanity: 0, corruption: 0 },
  sourceUpdatedAt: "2026-09-27T00:00:00.000Z",
};

describe("ficha do personagem", () => {
  it("aceita a ficha mínima e a projeção sem ficha (módulo antigo)", () => {
    expect(CharacterSheetSchema.safeParse(sheet()).success).toBe(true);
    expect(FoundryCharacterProjectionSchema.parse(projection).sheet).toBeUndefined();
    expect(FoundryCharacterProjectionSchema.parse({ ...projection, sheet: sheet() }).sheet?.characteristics.defense).toBe(10);
  });

  it("recusa campos fora do contrato e tipos de item desconhecidos", () => {
    expect(CharacterSheetSchema.safeParse({ ...sheet(), extra: true }).success).toBe(false);
    const invalidItem = {
      id: "x",
      name: "Varinha",
      description: "",
      type: "macro",
      quantity: 1,
      equipped: false,
      price: null,
      availability: null,
      properties: null,
      damage: null,
      hands: null,
      defense: null,
      consumableType: null,
    };
    expect(CharacterSheetSchema.safeParse({ ...sheet(), inventory: [invalidItem] }).success).toBe(false);
  });

  it("limita o tamanho total da ficha", () => {
    const talent = (index: number) => ({
      id: `t-${index}`,
      name: `Talento ${index}`,
      description: "x".repeat(1_500),
      kind: "talent" as const,
      group: null,
      uses: { value: null, max: null },
    });
    const large = sheet({ talents: Array.from({ length: 200 }, (_, index) => talent(index)) });
    expect(JSON.stringify(large).length).toBeLessThan(MAX_CHARACTER_SHEET_CHARS);
    expect(FoundryCharacterProjectionSchema.safeParse({ ...projection, sheet: large }).success).toBe(true);

    const spell = (index: number) => ({
      id: `s-${index}`,
      name: `Magia ${index}`,
      description: "z".repeat(1_500),
      tradition: "Teste",
      rank: 1,
      spellType: null,
      attribute: null,
      castings: { value: null, max: null },
      target: null,
      area: null,
      duration: null,
    });
    const huge = { ...large, spells: Array.from({ length: 120 }, (_, index) => spell(index)) };
    expect(CharacterSheetSchema.safeParse(huge).success).toBe(true);
    expect(JSON.stringify(huge).length).toBeGreaterThan(MAX_CHARACTER_SHEET_CHARS);
    expect(FoundryCharacterProjectionSchema.safeParse({ ...projection, sheet: huge }).success).toBe(false);
  });
});

describe("comando de anotações", () => {
  const command = {
    type: "character.notes.update",
    payload: {
      updateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      campaignId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      actorId: "aster-001",
      text: "Veio do norte.",
      revision: "e-1a2b3c4d",
      requestedBy: "Jogadora",
      requestedAt: "2026-10-03T12:00:00.000Z",
    },
  };

  it("aceita o comando tipado", () => {
    expect(FoundryCommandInputSchema.parse(command).type).toBe("character.notes.update");
  });

  it("recusa ator inválido e texto acima do limite", () => {
    expect(FoundryCommandInputSchema.safeParse({ ...command, payload: { ...command.payload, actorId: "../x" } }).success).toBe(false);
    expect(
      FoundryCommandInputSchema.safeParse({ ...command, payload: { ...command.payload, text: "x".repeat(8_001) } }).success,
    ).toBe(false);
  });
});
