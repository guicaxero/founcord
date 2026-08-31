import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requirePermission } from "@vigilia/authz";
import {
  AutomationJobCreateResponseSchema,
  AutomationJobListResponseSchema,
  AutomationJobSchema,
  type AutomationJob,
  type AutomationJobCreateResponse,
  type AutomationJobListResponse,
  type CreateAutomationJobInput,
} from "@vigilia/contracts";
import { getD1 } from "@/db";
import { prepareAudit } from "@/server/audit";
import type { AuthenticatedSession } from "@/server/auth/session";
import { HttpError } from "@/server/http";

export async function listCampaignAutomations(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<AutomationJobListResponse> {
  requirePermission(session.principal, "automation:read", {
    kind: "campaign",
    campaignId,
  });
  await assertCampaignAvailable(campaignId, false);
  return AutomationJobListResponseSchema.parse(
    await automationRequest(
      `/internal/automations/campaigns/${encodeURIComponent(campaignId)}/jobs`,
      { method: "GET", correlationId },
    ),
  );
}

export async function requestCampaignAutomation(
  session: AuthenticatedSession,
  input: CreateAutomationJobInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<AutomationJobCreateResponse> {
  if (input.kind === "session_summary" && input.target?.type !== "session_summary") {
    throw new HttpError(
      422,
      "session_summary_requires_session",
      "Gere resumos de sessão pela área Sessões, após revisar as fontes.",
    );
  }
  requirePermission(session.principal, "automation:run", {
    kind: "campaign",
    campaignId: input.campaignId,
  });
  await assertCampaignAvailable(input.campaignId, true);
  const result = AutomationJobCreateResponseSchema.parse(
    await automationRequest(
      `/internal/automations/campaigns/${encodeURIComponent(input.campaignId)}/jobs`,
      {
        method: "POST",
        correlationId,
        idempotencyKey,
        body: {
          ...input,
          requestedByUserId: session.user.id,
          requestedByName: session.user.displayName,
          correlationId,
        },
      },
    ),
  );
  if (!result.duplicate) {
    await prepareAudit(getD1(), {
      actorUserId: session.user.id,
      campaignId: input.campaignId,
      action: "automation.job.requested",
      entityType: "automation_job",
      entityId: result.job.id,
      correlationId,
      details: { kind: input.kind, sourceKind: input.source.kind },
    }).run();
  }
  return result;
}

export async function retryCampaignAutomation(
  session: AuthenticatedSession,
  campaignId: string,
  jobId: string,
  correlationId: string,
): Promise<AutomationJob> {
  requirePermission(session.principal, "automation:run", {
    kind: "campaign",
    campaignId,
  });
  await assertCampaignAvailable(campaignId, true);
  const result = AutomationJobSchema.parse(
    await automationRequest(
      `/internal/automations/campaigns/${encodeURIComponent(campaignId)}/jobs/${encodeURIComponent(jobId)}/retry`,
      { method: "POST", correlationId, body: {} },
    ),
  );
  await prepareAudit(getD1(), {
    actorUserId: session.user.id,
    campaignId,
    action: "automation.job.retried",
    entityType: "automation_job",
    entityId: jobId,
    correlationId,
  }).run();
  return result;
}

export async function cancelCampaignAutomation(
  session: AuthenticatedSession,
  campaignId: string,
  jobId: string,
  correlationId: string,
): Promise<void> {
  requirePermission(session.principal, "automation:run", {
    kind: "campaign",
    campaignId,
  });
  await automationRequest(
    `/internal/automations/campaigns/${encodeURIComponent(campaignId)}/jobs/${encodeURIComponent(jobId)}`,
    { method: "DELETE", correlationId },
  );
  await prepareAudit(getD1(), {
    actorUserId: session.user.id,
    campaignId,
    action: "automation.job.cancelled",
    entityType: "automation_job",
    entityId: jobId,
    correlationId,
  }).run();
}

async function assertCampaignAvailable(
  campaignId: string,
  rejectArchived: boolean,
): Promise<void> {
  const campaign = await getD1()
    .prepare("SELECT status FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<{ status: "draft" | "active" | "archived" }>();
  if (!campaign) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
  if (rejectArchived && campaign.status === "archived") {
    throw new HttpError(
      409,
      "campaign_archived",
      "Reative a campanha antes de iniciar uma automação.",
    );
  }
}

async function automationRequest(
  path: string,
  options: Readonly<{
    method: "GET" | "POST" | "DELETE";
    correlationId: string;
    body?: unknown;
    idempotencyKey?: string;
  }>,
): Promise<unknown> {
  const { env } = getCloudflareContext();
  const token =
    process.env.AUTOMATION_SERVICE_TOKEN ?? env.AUTOMATION_SERVICE_TOKEN;
  const baseUrl =
    process.env.AUTOMATION_WORKER_URL ??
    env.AUTOMATION_WORKER_URL ??
    "https://ordem-automation.ordem-da-ultima-luz.workers.dev";
  if (!token || token.length < 32) {
    throw new HttpError(
      503,
      "automation_not_configured",
      "O serviço de automações ainda não está configurado.",
    );
  }
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "x-correlation-id": options.correlationId,
  });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      method: options.method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new HttpError(
      503,
      "automation_service_unavailable",
      "O serviço de automações está indisponível. Tente novamente.",
    );
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    throw new HttpError(
      response.status,
      typeof record.error === "string" ? record.error : "automation_service_failed",
      typeof record.message === "string"
        ? record.message
        : "O serviço de automações não concluiu a operação.",
    );
  }
  return body;
}
