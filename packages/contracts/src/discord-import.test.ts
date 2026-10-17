import { describe, expect, it } from "vitest";
import {
  DiscordImportInputSchema,
  discordContentToText,
  missionRegionFrom,
  parseMissionThreadTitle,
  snowflakeDate,
} from "./discord-import";

describe("importação de crônicas do Discord", () => {
  it("troca menções, emojis e marcas de tempo por texto", () => {
    const text = discordContentToText(
      "Oi <@111111111111111111> e <@!222222222222222222>, <@&333333333333333333> em <#444444444444444444> " +
        "<:corvo:555555555555555555> <a:chama:666666666666666666> em <t:1791555200:D>",
      [{ id: "111111111111111111", name: "Argent" }],
    );
    expect(text).toBe("Oi @Argent e @alguém, @cargo em #canal :corvo: :chama: em 09/10/2026");
  });

  it("lê a data embutida no id do Discord", () => {
    expect(snowflakeDate("175928847299117063")).toBe("2016-04-30T11:18:25.796Z");
  });

  it("recusa tópicos repetidos, ids inválidos e mais de 20 por vez", () => {
    const forumChannelId = "1536153443985531111";
    expect(DiscordImportInputSchema.parse({ forumChannelId, threadIds: ["1290000000000000000"] }).publish).toBe(false);
    expect(DiscordImportInputSchema.safeParse({ forumChannelId, threadIds: ["1", "1"] }).success).toBe(false);
    expect(DiscordImportInputSchema.safeParse({ forumChannelId, threadIds: ["../x"] }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, index) => String(1_290_000_000_000_000_000n + BigInt(index)));
    expect(DiscordImportInputSchema.safeParse({ forumChannelId, threadIds: many }).success).toBe(false);
  });
});

describe("registros de missão do Discord", () => {
  it("separa número e nome do título do tópico", () => {
    expect(parseMissionThreadTitle("Missão Nº 002 - Ecos na Floresta")).toEqual({ number: 2, title: "Ecos na Floresta" });
    expect(parseMissionThreadTitle("Missão N° 001 — Problemas na Vila de Asilo")).toEqual({
      number: 1,
      title: "Problemas na Vila de Asilo",
    });
    expect(parseMissionThreadTitle("missao 12: A torre")).toEqual({ number: 12, title: "A torre" });
    expect(parseMissionThreadTitle("A caravana de ossos")).toEqual({ number: null, title: "A caravana de ossos" });
  });

  it("lê a região da linha Local do chamado", () => {
    expect(missionRegionFrom("**Grau:** @Iniciante\nLocal: Floresta próxima à Ordem\nRecompensa: 3 co")).toBe(
      "Floresta próxima à Ordem",
    );
    expect(missionRegionFrom("**Local:** Vila de Asilo")).toBe("Vila de Asilo");
    expect(missionRegionFrom("Sem local informado.")).toBeNull();
  });
});
