import { describe, expect, it } from "vitest";
import { discordThreadUrl, parseDiscordThreadReference } from "./registro";

describe("Registro do Corvo", () => {
  it("lê o tópico de links do Discord e de IDs soltos", () => {
    expect(parseDiscordThreadReference("1545992952369774683")).toEqual({ threadId: "1545992952369774683", guildId: null });
    expect(parseDiscordThreadReference("https://discord.com/channels/1529124400694300702/1536160000000000000")).toEqual({
      threadId: "1536160000000000000",
      guildId: "1529124400694300702",
    });
    // Link de uma mensagem dentro do tópico: o tópico é o segundo ID.
    expect(
      parseDiscordThreadReference("https://ptb.discord.com/channels/1529124400694300702/1536160000000000000/1545992952369774683"),
    ).toEqual({ threadId: "1536160000000000000", guildId: "1529124400694300702" });
  });

  it("recusa links de outros sites ou sem tópico", () => {
    for (const bad of [
      "https://example.com/channels/1529124400694300702/1536160000000000000",
      "http://discord.com/channels/1529124400694300702/1536160000000000000",
      "https://discord.com/channels/1529124400694300702",
      "javascript:alert(1)",
      "tópico do Aster",
    ]) {
      expect(parseDiscordThreadReference(bad), bad).toBeNull();
    }
  });

  it("monta o link do tópico", () => {
    expect(discordThreadUrl("1", "2")).toBe("https://discord.com/channels/1/2");
  });
});
