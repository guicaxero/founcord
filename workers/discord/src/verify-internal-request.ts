export async function verifyInternalRequest(
  request: Request,
  configuredToken: string,
): Promise<boolean> {
  if (configuredToken.trim().length < 32) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const suppliedToken = authorization.slice("Bearer ".length);
  if (suppliedToken.length < 32) return false;

  const [suppliedDigest, configuredDigest] = await Promise.all([
    digest(suppliedToken),
    digest(configuredToken),
  ]);
  let difference = 0;
  for (let index = 0; index < configuredDigest.length; index += 1) {
    difference |= configuredDigest[index]! ^ suppliedDigest[index]!;
  }
  return difference === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
