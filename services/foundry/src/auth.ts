import type { FoundryEnv, AuthenticatedWorld } from "./types";
import { findWorldByTokenHash } from "./repository";

export function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

export async function assertStaticBearer(
  request: Request,
  expected: string | undefined,
): Promise<void> {
  const supplied = bearerToken(request);
  if (!expected || expected.length < 32 || !supplied) {
    throw new FoundryBridgeError(401, "unauthorized", "Credencial inválida.");
  }
  const [suppliedHash, expectedHash] = await Promise.all([
    hashToken(supplied),
    hashToken(expected),
  ]);
  if (!constantTimeEqual(suppliedHash, expectedHash)) {
    throw new FoundryBridgeError(401, "unauthorized", "Credencial inválida.");
  }
}

export async function authenticateWorld(
  request: Request,
  env: FoundryEnv,
  worldId: string,
): Promise<AuthenticatedWorld> {
  const token = bearerToken(request);
  if (token.length < 43) {
    throw new FoundryBridgeError(401, "invalid_world_token", "Mundo não autorizado.");
  }
  const world = await findWorldByTokenHash(env, worldId, await hashToken(token));
  if (!world) {
    throw new FoundryBridgeError(401, "invalid_world_token", "Mundo não autorizado.");
  }
  return world;
}

export function generateAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export class FoundryBridgeError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FoundryBridgeError";
  }
}
