import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hasPermission, requirePermission } from "@ordem/authz";
import {
  FoundryCaptureSessionListResponseSchema,
  FoundryCaptureSessionSchema,
  FoundryCaptureTranscriptSchema,
  FoundryPairingApprovalResponseSchema,
  FoundryPairingPreviewSchema,
  FoundryPortalPairingViewSchema,
  FoundryWorldListResponseSchema,
  type FoundryCaptureSession,
  type FoundryCaptureTranscript,
  type FoundryPairingApprovalResponse,
  type FoundryPortalPairingView,
  type FoundryWorldListResponse,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import { prepareAudit } from "@/server/shared/audit";
import type { AuthenticatedSession } from "@/server/identity/session";
import { listCampaigns } from "@/server/campaign/campaigns";
import { HttpError } from "@/server/shared/http";

type CampaignIdentityRow = Readonly<{
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
}>;

export async function getFoundryPairingView(
  session: AuthenticatedSession,
  userCode: string,
  correlationId: string,
): Promise<FoundryPortalPairingView> {
  const campaigns = (await listCampaigns(session)).filter(
    (campaign) =>
      campaign.status !== "archived" &&
      hasPermission(session.principal, "foundry:world:manage", {
        kind: "campaign",
        campaignId: campaign.id,
      }),
  );
  if (campaigns.length === 0) {
    throw new HttpError(
      403,
      "foundry_campaign_unavailable",
      "Sua conta não possui nenhuma campanha em que possa conectar este mundo.",
    );
  }
  const pairing = FoundryPairingPreviewSchema.parse(
    await foundryRequest("/internal/foundry/pairings/preview", {
      method: "POST",
      correlationId,
      body: { userCode },
    }),
  );
  return FoundryPortalPairingViewSchema.parse({
    pairing,
    eligibleCampaigns: campaigns,
  });
}

export async function approveFoundryPairing(
  session: AuthenticatedSession,
  pairingId: string,
  campaignId: string,
  correlationId: string,
): Promise<FoundryPairingApprovalResponse> {
  requirePermission(session.principal, "foundry:world:manage", {
    kind: "campaign",
    campaignId,
  });
  const campaign = await getCampaignIdentity(campaignId);
  if (campaign.status === "archived") {
    throw new HttpError(
      409,
      "campaign_archived",
      "Reative a campanha antes de conectar um mundo.",
    );
  }
  const result = FoundryPairingApprovalResponseSchema.parse(
    await foundryRequest(
      `/internal/foundry/pairings/${encodeURIComponent(pairingId)}/approve`,
      {
        method: "POST",
        correlationId,
        body: {
          campaignId,
          campaignName: campaign.name,
          authorizedByUserId: session.user.id,
        },
      },
    ),
  );
  const db = getD1();
  await db.batch([
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "foundry.world.connected",
      entityType: "foundry_world",
      entityId: result.worldId,
      correlationId,
      details: { pairingId },
    }),
  ]);
  return result;
}

export async function getFoundryWorlds(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<FoundryWorldListResponse> {
  requirePermission(session.principal, "foundry:world:manage", {
    kind: "campaign",
    campaignId,
  });
  await getCampaignIdentity(campaignId);
  const response = await foundryRequest(
    `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds`,
    { method: "GET", correlationId },
  );
  const worlds =
    response && typeof response === "object" && "worlds" in response
      ? (response as { worlds: unknown }).worlds
      : [];
  return FoundryWorldListResponseSchema.parse({ data: worlds });
}

export async function disconnectFoundryWorld(
  session: AuthenticatedSession,
  campaignId: string,
  worldId: string,
  correlationId: string,
): Promise<Readonly<{ worldId: string; revoked: true }>> {
  requirePermission(session.principal, "foundry:world:manage", {
    kind: "campaign",
    campaignId,
  });
  const result = await foundryRequest(
    `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}`,
    { method: "DELETE", correlationId },
  );
  const db = getD1();
  await db.batch([
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "foundry.world.disconnected",
      entityType: "foundry_world",
      entityId: worldId,
      correlationId,
    }),
  ]);
  return result as Readonly<{ worldId: string; revoked: true }>;
}

export async function requestFoundryCharacterSync(
  session: AuthenticatedSession,
  campaignId: string,
  worldId: string,
  correlationId: string,
): Promise<Readonly<{ commandId: string; duplicate: boolean }>> {
  requirePermission(session.principal, "foundry:world:manage", {
    kind: "campaign",
    campaignId,
  });
  const idempotencyKey = `portal:sync:${worldId}:${crypto.randomUUID()}`;
  const result = await foundryRequest(
    `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}/commands`,
    {
      method: "POST",
      correlationId,
      idempotencyKey,
      body: { command: { type: "actor.sync.request", payload: {} } },
    },
  );
  const db = getD1();
  await db.batch([
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "foundry.sync.requested",
      entityType: "foundry_world",
      entityId: worldId,
      correlationId,
    }),
  ]);
  return result as Readonly<{ commandId: string; duplicate: boolean }>;
}

export async function listFoundryCaptureStates(
  campaignId: string,
  correlationId: string,
): Promise<FoundryCaptureSession[]> {
  return FoundryCaptureSessionListResponseSchema.parse(
    await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/capture-sessions`,
      { method: "GET", correlationId },
    ),
  ).data;
}

export async function startFoundryCapture(
  input: Readonly<{
    sessionId: string;
    campaignId: string;
    worldId: string;
    startedAt: string;
  }>,
  correlationId: string,
): Promise<FoundryCaptureSession> {
  return FoundryCaptureSessionSchema.parse(
    await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(input.campaignId)}/worlds/${encodeURIComponent(input.worldId)}/capture-sessions`,
      { method: "POST", correlationId, body: input },
    ),
  );
}

export async function endFoundryCapture(
  campaignId: string,
  worldId: string,
  sessionId: string,
  correlationId: string,
): Promise<FoundryCaptureSession> {
  return FoundryCaptureSessionSchema.parse(
    await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}/capture-sessions/${encodeURIComponent(sessionId)}/end`,
      { method: "POST", correlationId, body: {} },
    ),
  );
}

export async function cancelFoundryCapture(
  campaignId: string,
  worldId: string,
  sessionId: string,
  correlationId: string,
): Promise<FoundryCaptureSession> {
  return FoundryCaptureSessionSchema.parse(
    await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}/capture-sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", correlationId },
    ),
  );
}

export async function getFoundryCaptureTranscript(
  campaignId: string,
  worldId: string,
  sessionId: string,
  correlationId: string,
): Promise<FoundryCaptureTranscript> {
  return FoundryCaptureTranscriptSchema.parse(
    await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}/capture-sessions/${encodeURIComponent(sessionId)}/transcript`,
      { method: "GET", correlationId },
    ),
  );
}

async function getCampaignIdentity(campaignId: string): Promise<CampaignIdentityRow> {
  const campaign = await getD1()
    .prepare("SELECT id, name, status FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<CampaignIdentityRow>();
  if (!campaign) {
    throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
  }
  return campaign;
}

export async function foundryRequest(
  path: string,
  options: Readonly<{
    method: "GET" | "POST" | "DELETE";
    correlationId: string;
    body?: unknown;
    idempotencyKey?: string;
  }>,
): Promise<unknown> {
  const { env } = getCloudflareContext();
  const token = process.env.INTEGRATION_SERVICE_TOKEN ?? env.INTEGRATION_SERVICE_TOKEN;
  const baseUrl =
    process.env.FOUNDRY_BRIDGE_URL ??
    env.FOUNDRY_BRIDGE_URL ??
    "https://ordem-foundry-bridge.ordem-da-ultima-luz.workers.dev";
  if (!token || token.length < 32) {
    throw new HttpError(
      503,
      "foundry_integration_not_configured",
      "A conexão com o Foundry ainda não está configurada.",
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
    const init: RequestInit = {
      method: options.method,
      headers,
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    response = await fetch(new URL(path, baseUrl), init);
  } catch {
    throw new HttpError(
      503,
      "foundry_bridge_unavailable",
      "Não foi possível alcançar o serviço do Foundry. Tente novamente.",
    );
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    throw new HttpError(
      response.status,
      typeof record.error === "string" ? record.error : "foundry_bridge_failed",
      typeof record.message === "string"
        ? record.message
        : "O serviço do Foundry não concluiu a operação.",
    );
  }
  return body;
}
