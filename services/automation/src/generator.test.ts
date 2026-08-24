import { describe, expect, it } from "vitest";
import { parseGeneratedDraft } from "./generator";

describe("automation generator output", () => {
  it("accepts a valid JSON response from Workers AI", () => {
    expect(
      parseGeneratedDraft({
        response: JSON.stringify({
          title: "A vigília no moinho",
          body: "## Resumo\n\nA patrulha alcançou o moinho e decidiu manter a vigília durante a noite.",
        }),
      }),
    ).toEqual({
      title: "A vigília no moinho",
      body: "## Resumo\n\nA patrulha alcançou o moinho e decidiu manter a vigília durante a noite.",
    });
  });

  it("removes a markdown fence without accepting prose outside the JSON", () => {
    const result = parseGeneratedDraft({
      response:
        "```json\n{\"title\":\"Registro extraído\",\"body\":\"## Locais\\n\\nO moinho foi visitado durante a patrulha e permaneceu sob observação.\"}\n```",
    });
    expect(result.title).toBe("Registro extraído");
  });

  it("rejects incomplete output before it reaches the portal", () => {
    expect(() => parseGeneratedDraft({ response: "{\"title\":\"Curto\"}" })).toThrow(
      "contrato editorial",
    );
  });
});
