export async function assertAutomationServiceRequest(
  request: Request,
  expectedToken: string,
): Promise<void> {
  if (!expectedToken || expectedToken.length < 32) {
    throw new AutomationServiceError(
      503,
      "service_not_configured",
      "O serviço de automações ainda não está configurado.",
    );
  }
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!supplied || !(await tokensEqual(supplied, expectedToken))) {
    throw new AutomationServiceError(401, "invalid_service_token", "Serviço não autorizado.");
  }
}

export class AutomationServiceError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 409 | 422 | 429 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AutomationServiceError";
  }
}

async function tokensEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([hash(left), hash(right)]);
  if (leftHash.length !== rightHash.length) return false;
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index);
  }
  return difference === 0;
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
