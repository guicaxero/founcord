import {
  AutomationDraftCallbackResponseSchema,
  type AutomationDraftCallback,
  type AutomationDraftCallbackResponse,
} from "@ordem/contracts";
import type { AutomationEnv } from "./types";

const INTERNAL_ORIGIN = "https://portal.internal";

export async function createPortalAutomationDraft(
  env: AutomationEnv,
  input: AutomationDraftCallback,
  correlationId: string,
): Promise<AutomationDraftCallbackResponse> {
  const response = await env.PORTAL.fetch(
    new Request(`${INTERNAL_ORIGIN}/api/internal/automation/drafts`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.AUTOMATION_SERVICE_TOKEN}`,
        "content-type": "application/json",
        "idempotency-key": `automation:${input.jobId}`,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify(input),
    }),
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = extractMessage(body);
    throw new Error(message ?? `O portal recusou o rascunho com status ${response.status}.`);
  }
  return AutomationDraftCallbackResponseSchema.parse(body);
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : null;
}
