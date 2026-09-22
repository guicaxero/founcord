import { describe, expect, it } from "vitest";
import { decodeJson, encodeJson, sha256, sign, verifySignature } from "./crypto";

describe("primitivas de autenticação", () => {
  it("assina e rejeita adulteração", async () => {
    const signature = await sign("payload", "um-segredo-longo-de-desenvolvimento");
    await expect(
      verifySignature("payload", signature, "um-segredo-longo-de-desenvolvimento"),
    ).resolves.toBe(true);
    await expect(
      verifySignature("alterado", signature, "um-segredo-longo-de-desenvolvimento"),
    ).resolves.toBe(false);
  });

  it("produz PKCE SHA-256 e serializa estado", async () => {
    await expect(sha256("verifier")).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
    const encoded = encodeJson({ returnTo: "/dashboard" });
    expect(decodeJson<{ returnTo: string }>(encoded).returnTo).toBe("/dashboard");
  });
});
