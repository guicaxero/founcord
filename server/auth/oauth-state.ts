import { HttpError } from "../http";
import { decodeJson, encodeJson, sign, verifySignature } from "./crypto";

export type OAuthState = Readonly<{
  state: string;
  verifier: string;
  returnTo: string;
  issuedAt: number;
}>;

export async function encodeOAuthState(
  value: OAuthState,
  secret: string,
): Promise<string> {
  const payload = encodeJson(value);
  return `${payload}.${await sign(payload, secret)}`;
}

export async function decodeOAuthState(
  value: string,
  secret: string,
): Promise<OAuthState> {
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !(await verifySignature(payload, signature, secret))) {
    throw new HttpError(400, "invalid_oauth_state", "A tentativa de login expirou.");
  }
  const state = decodeJson<OAuthState>(payload);
  if (Date.now() - state.issuedAt > 10 * 60 * 1_000) {
    throw new HttpError(400, "expired_oauth_state", "A tentativa de login expirou.");
  }
  return state;
}
