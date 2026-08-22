import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sha256 } from "../auth/crypto";
import { HttpError } from "../http";

export async function assertIntegrationServiceRequest(
  request: Request,
): Promise<void> {
  const { env } = getCloudflareContext();
  const expected =
    env.INTEGRATION_SERVICE_TOKEN ?? process.env.INTEGRATION_SERVICE_TOKEN;
  if (!expected || expected.length < 32) {
    throw new HttpError(
      503,
      "integration_not_configured",
      "A integração interna ainda não está configurada.",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (
    !supplied ||
    !constantTimeEqual(await sha256(supplied), await sha256(expected))
  ) {
    throw new HttpError(401, "invalid_service_token", "Serviço não autorizado.");
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
