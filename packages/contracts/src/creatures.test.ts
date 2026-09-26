import { describe, expect, test } from "vitest";
import {
  CreatureDraftSchema,
  CreatureImagePathSchema,
  moduleSupportsCreatures,
} from "./creatures";
import {
  blankCreatureDraft,
  compendiumSourceKey,
  creatureFromFoundryExport,
  htmlToPlainText,
  nearestDifficulty,
  spellFromFoundryExport,
} from "./creatures-import";
import { FoundryCommandInputSchema } from "./foundry";

// Documentos sintéticos no formato do export do Foundry; nenhum conteúdo dos livros.
const exportedCreature = {
  _id: "abc123",
  name: "Fera de Teste",
  type: "creature",
  img: "tokenizer/fera/token.webp",
  system: {
    attributes: {
      strength: { base: 12, value: 12 },
      agility: { base: 11, value: 11 },
      intellect: { base: 6, value: 6 },
      will: { base: 9, value: 9 },
      perception: { base: 10, value: 10 },
    },
    characteristics: {
      defense: 13,
      health: { max: 22, value: 22 },
      insanity: { value: 0 },
      corruption: { value: 1 },
      power: 0,
      size: "1",
      speed: 12,
    },
    difficulty: 9,
    descriptor: "Criatura média (fera)",
    perceptionsenses: "visão no escuro",
    speedtraits: "",
    armor: "",
    frightening: true,
    horrifying: false,
    description: "<p>Uma fera &amp; seu uivo.</p><p>Segundo parágrafo.</p>",
  },
  items: [
    {
      _id: "w1",
      name: "Mordida",
      type: "weapon",
      img: "icons/svg/mystery-man.svg",
      system: {
        description: "",
        properties: "",
        action: { attack: "+2", against: "Defense", damage: "1d6", boonsbanes: "1" },
      },
    },
    { _id: "t1", name: "Faro", type: "talent", system: { description: "<p>Sente cheiros.</p>" } },
    { _id: "s1", name: "Salto", type: "specialaction", system: { description: "" } },
    { _id: "e1", name: "Uivo", type: "endoftheround", system: { description: "" } },
    { _id: "x1", name: "Ignorado", type: "feature", system: {} },
  ],
};

const exportedSpell = {
  _id: "sp1",
  name: "Clarão de Teste",
  type: "spell",
  img: "javascript:alert(1)",
  system: {
    description: "<p>Um clarão.</p>",
    tradition: "Teste",
    rank: 2,
    attribute: "Will",
    spelltype: "Attack",
    target: "uma criatura",
    area: "",
    duration: "1 rodada",
  },
};

describe("importação do compêndio", () => {
  test("converte uma criatura exportada do Foundry", () => {
    const draft = creatureFromFoundryExport(exportedCreature);
    expect(draft.name).toBe("Fera de Teste");
    expect(draft.difficulty).toBe(10);
    expect(draft.attributes).toEqual({ strength: 12, agility: 11, intellect: 6, will: 9, perception: 10 });
    expect([draft.defense, draft.health, draft.speed, draft.corruption]).toEqual([13, 22, 12, 1]);
    expect(draft.frightening).toBe(true);
    expect(draft.description).toBe("Uma fera & seu uivo.\nSegundo parágrafo.");
    expect(draft.image).toBe("tokenizer/fera/token.webp");
    expect(draft.items.map((item) => item.kind)).toEqual(["attack", "trait", "special_action", "end_of_round"]);
    const attack = draft.items[0]!;
    expect(attack.kind === "attack" && [attack.bonus, attack.against, attack.damage, attack.boons]).toEqual([
      "+2",
      "defense",
      "1d6",
      1,
    ]);
  });

  test("leva descritores longos para a descrição", () => {
    const note = "n".repeat(130);
    const draft = creatureFromFoundryExport({
      ...exportedCreature,
      system: { ...exportedCreature.system, descriptor: note },
    });
    expect(draft.descriptor).toBe("");
    expect(draft.description.startsWith(`Nota: ${note}`)).toBe(true);
  });

  test("recusa documentos de outro tipo", () => {
    expect(() => creatureFromFoundryExport(exportedSpell)).toThrow();
    expect(() => spellFromFoundryExport(exportedCreature)).toThrow();
  });

  test("converte uma magia e descarta imagens inseguras", () => {
    const spell = spellFromFoundryExport(exportedSpell);
    expect(spell).toMatchObject({
      name: "Clarão de Teste",
      tradition: "Teste",
      rank: 2,
      attribute: "will",
      spellType: "attack",
      duration: "1 rodada",
      image: null,
    });
  });

  test("usa o _id como chave de origem, ou o nome do arquivo", () => {
    expect(compendiumSourceKey(exportedCreature, "Fera.json")).toBe("abc123");
    expect(compendiumSourceKey({ name: "x" }, "Fera.json")).toBe("Fera");
  });

  test("converte HTML em texto simples", () => {
    expect(htmlToPlainText("<ul><li>um</li><li>dois</li></ul>")).toBe("• um\n• dois");
    expect(htmlToPlainText("a<br>b &#39;c&#x27;")).toBe("a\nb 'c'");
  });

  test("arredonda para a dificuldade válida mais próxima", () => {
    expect(nearestDifficulty(0)).toBe(1);
    expect(nearestDifficulty(30)).toBe(25);
    expect(nearestDifficulty(9_999)).toBe(500);
  });
});

describe("ficha em branco", () => {
  test("usa a mediana do bestiário na mesma dificuldade", () => {
    const bestiary = [
      { kind: "creature" as const, difficulty: 10, defense: 12, health: 20 },
      { kind: "creature" as const, difficulty: 10, defense: 14, health: 30 },
      { kind: "creature" as const, difficulty: 10, defense: 15, health: 40 },
      { kind: "creature" as const, difficulty: 50, defense: 20, health: 90 },
    ];
    const draft = blankCreatureDraft(10, bestiary);
    expect([draft.defense, draft.health]).toEqual([14, 30]);
  });

  test("sem bestiário, usa a base humana", () => {
    const draft = blankCreatureDraft(25);
    expect(draft.attributes.strength).toBe(10);
    expect([draft.defense, draft.health, draft.speed]).toEqual([10, 10, 10]);
    expect(CreatureDraftSchema.safeParse(draft).success).toBe(true);
  });
});

describe("contrato da criatura", () => {
  test("aceita só caminhos do Foundry ou HTTPS como imagem", () => {
    for (const ok of ["icons/svg/mystery-man.svg", "worlds/mesa/token%20a.webp?1", "https://exemplo.com/a.png"]) {
      expect(CreatureImagePathSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ["../segredo.png", "/etc/passwd", "javascript:alert(1)", "data:image/png;base64,AA", "http://x/a.png"]) {
      expect(CreatureImagePathSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  test("valida o comando creature.upsert", () => {
    const creature = blankCreatureDraft(5);
    const command = {
      type: "creature.upsert",
      payload: {
        creatureId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        campaignId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        version: 3,
        creature,
        requestedAt: "2026-09-26T12:00:00.000Z",
      },
    };
    expect(FoundryCommandInputSchema.parse(command).type).toBe("creature.upsert");
    expect(FoundryCommandInputSchema.safeParse({ ...command, payload: { ...command.payload, version: 0 } }).success).toBe(
      false,
    );
  });

  test("exige o módulo 0.10.0 ou mais novo", () => {
    expect(moduleSupportsCreatures("0.9.0")).toBe(false);
    expect(moduleSupportsCreatures("0.10.0")).toBe(true);
    expect(moduleSupportsCreatures("1.0.0")).toBe(true);
  });
});
