/** Verifica o /health dos quatro Workers após um deploy de produção. */
type SmokeService = Readonly<{
  name: string;
  url: string;
  environmentVariable: string;
}>;

type SmokeResult = SmokeService & Readonly<{ ok: boolean; detail: string }>;

const DEFAULT_SERVICES: readonly SmokeService[] = [
  {
    name: "portal",
    url: "https://ordem-da-ultima-luz.ordem-da-ultima-luz.workers.dev/api/health",
    environmentVariable: "SMOKE_PORTAL_URL",
  },
  {
    name: "discord-integration",
    url: "https://ordem-discord-integration.ordem-da-ultima-luz.workers.dev/health",
    environmentVariable: "SMOKE_INTEGRATION_URL",
  },
  {
    name: "foundry-bridge",
    url: "https://ordem-foundry-bridge.ordem-da-ultima-luz.workers.dev/health",
    environmentVariable: "SMOKE_FOUNDRY_URL",
  },
  {
    name: "automation",
    url: "https://ordem-automation.ordem-da-ultima-luz.workers.dev/health",
    environmentVariable: "SMOKE_AUTOMATION_URL",
  },
];

const services = DEFAULT_SERVICES.map((service) => ({
  ...service,
  url: normalizedUrl(process.env[service.environmentVariable] || service.url),
}));

const results = await Promise.all(services.map(checkService));
const failed = results.filter((result) => !result.ok);

for (const result of results) {
  const marker = result.ok ? "OK" : "FAIL";
  console.log(`${marker} ${result.name} ${result.url} ${result.detail}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}

async function checkService(service: SmokeService): Promise<SmokeResult> {
  let lastDetail = "not checked";

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(service.url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const payload: unknown = await response.json().catch(() => null);
      const status =
        payload && typeof payload === "object" && "status" in payload
          ? payload.status
          : null;

      if (response.ok && status === "ok") {
        return {
          ...service,
          ok: true,
          detail: `responded ${response.status} on attempt ${attempt}`,
        };
      }

      lastDetail = `responded ${response.status} with status ${String(status)}`;
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : "unknown request failure";
    }

    if (attempt < 6) await delay(attempt * 2_000);
  }

  return { ...service, ok: false, detail: lastDetail };
}

function normalizedUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`Smoke endpoint must use HTTPS: ${value}`);
  }
  return url.toString();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
export {};
