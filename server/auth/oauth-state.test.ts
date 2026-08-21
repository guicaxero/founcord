import { describe, expect, it } from "vitest";
import { decodeOAuthState, encodeOAuthState } from "./oauth-state";

describe("estado OAuth", () => {
  it("é assinado e preserva apenas retorno relativo", async () => {
    const secret = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
    const encoded = await encodeOAuthState(
      {
        state: "state",
        verifier: "verifier",
        returnTo: "/dashboard",
        issuedAt: Date.now(),
      },
      secret,
    );
    await expect(decodeOAuthState(encoded, secret)).resolves.toMatchObject({
      state: "state",
      returnTo: "/dashboard",
    });
    await expect(decodeOAuthState(`${encoded}x`, secret)).rejects.toThrow();
  });
});
