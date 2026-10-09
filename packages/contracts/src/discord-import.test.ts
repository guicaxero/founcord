import { describe, expect, it } from "vitest";
import { DiscordImportInputSchema, discordContentToText, snowflakeDate } from "./discord-import";

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
