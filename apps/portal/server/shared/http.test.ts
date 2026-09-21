import { describe, expect, it } from "vitest";
import { assertSameOrigin, HttpError } from "@/server/shared/http";

describe("proteção de origem", () => {
  it("aceita a origem do próprio portal", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://portal.example/api/action", {
          method: "POST",
          headers: { origin: "https://portal.example" },
        }),
      ),
    ).not.toThrow();
  });

  it("bloqueia uma origem externa", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://portal.example/api/action", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow(HttpError);
  });
});
