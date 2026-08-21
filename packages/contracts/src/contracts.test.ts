import { describe, expect, it } from "vitest";
import {
  CreateMissionSchema,
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
});
