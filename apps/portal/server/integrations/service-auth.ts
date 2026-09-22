import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sha256 } from "@/server/identity/crypto";
import { HttpError } from "@/server/shared/http";

export async function assertIntegrationServiceRequest(
  request: Request,
): Promise<void> {
  const { env } = getCloudflareContext();
  const expected =
    env.INTEGRATION_SERVICE_TOKEN ?? process.env.INTEGRATION_SERVICE_TOKEN;
  await assertServiceToken(request, expected, {
    configurationCode: "integration_not_configured",
    configurationMessage: "A integração interna ainda não está configurada.",
  });
}

export async function assertAutomationServiceRequest(
  request: Request,
): Promise<void> {
  const { env } = getCloudflareContext();
  const expected =
    env.AUTOMATION_SERVICE_TOKEN ?? process.env.AUTOMATION_SERVICE_TOKEN;
  await assertServiceToken(request, expected, {
    configurationCode: "automation_not_configured",
    configurationMessage: "O serviço de automações ainda não está configurado.",
  });
}

async function assertServiceToken(
  request: Request,
  expected: string | undefined,
  configuration: Readonly<{
    configurationCode: string;
    configurationMessage: string;
  }>,
): Promise<void> {
  if (!expected || expected.length < 32) {
    throw new HttpError(
      503,
      configuration.configurationCode,
      configuration.configurationMessage,
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
