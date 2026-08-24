import { describe, expect, it } from "vitest";
import {
  CreateMissionSchema,
  FoundryCharacterSyncRequestSchema,
  FoundryCommandCreateRequestSchema,
  FoundryPairingCreateRequestSchema,
  FoundryUserCodeSchema,
  UpdatePostSchema,
} from "./index";

describe("contratos públicos", () => {
  it("normaliza uma missão válida", () => {
    const mission = CreateMissionSchema.parse({
      campaignId: "11111111-1111-4111-8111-111111111111",
      title: "  Torre sem sombra  ",
      summary: "Há uma luz onde não deveria.",
      region: "Ermos",
    });
    expect(mission.title).toBe("Torre sem sombra");
    expect(mission.partySize).toBe(5);
  });

  it("exige versão otimista nas mudanças editoriais", () => {
    expect(() => UpdatePostSchema.parse({ status: "published" })).toThrow();
    expect(() => UpdatePostSchema.parse({ version: 1 })).toThrow();
  });

  it("aceita somente projeções sanitizadas de personagens do Demon Lord", () => {
    const sync = FoundryCharacterSyncRequestSchema.parse({
      syncId: "22222222-2222-4222-8222-222222222222",
      capturedAt: "2026-08-23T02:00:00.000Z",
      characters: [
        {
          actorId: "aster-001",
          name: "Aster",
          type: "character",
          ownerUserIds: ["user-001"],
          level: 2,
          ancestry: "Humano",
          paths: {
            novice: "Guerreiro",
            expert: null,
            master: null,
            legendary: null,
          },
          statistics: {
            healthMax: 18,
            damage: 3,
            healingRate: 4,
            insanity: 1,
            corruption: 0,
          },
          sourceUpdatedAt: "2026-08-23T01:59:00.000Z",
        },
      ],
    });
    expect(sync.characters[0]?.name).toBe("Aster");
    expect(() =>
      FoundryCharacterSyncRequestSchema.parse({
        ...sync,
        characters: [{ ...sync.characters[0], gmNotes: "segredo" }],
      }),
    ).toThrow();
  });

  it("não permite comandos arbitrários no Foundry", () => {
    expect(() =>
      FoundryCommandCreateRequestSchema.parse({
        command: { type: "macro.execute", payload: { script: "game.users" } },
      }),
    ).toThrow();
    expect(
      FoundryCommandCreateRequestSchema.parse({
        command: { type: "actor.sync.request", payload: {} },
      }).command.type,
    ).toBe("actor.sync.request");
  });

  it("inicia pareamento sem aceitar campanha escolhida pelo Foundry", () => {
    const identity = {
      worldInstanceId: "33333333-3333-4333-8333-333333333333",
      foundryWorldId: "ordem-da-ultima-luz",
      worldTitle: "Ordem da Última Luz",
      systemId: "demonlord",
      foundryVersion: "14.320",
      systemVersion: "6.1.4",
      moduleVersion: "0.2.0",
    };
    expect(FoundryPairingCreateRequestSchema.parse(identity)).toEqual(identity);
    expect(() =>
      FoundryPairingCreateRequestSchema.parse({
        ...identity,
        campaignId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toThrow();
    expect(FoundryUserCodeSchema.parse("lume-7k4p-9q2m")).toBe(
      "LUME-7K4P-9Q2M",
    );
  });
});
