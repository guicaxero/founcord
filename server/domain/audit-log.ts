import { requirePermission } from "@vigilia/authz";
import type { AuditEntry } from "@vigilia/contracts";
import { getD1 } from "@/db";
import type { AuthenticatedSession } from "../auth/session";
import { toIsoDateTime } from "../time";

type AuditRow = Readonly<{
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  campaign_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  correlation_id: string;
  details_json: string;
  created_at: string;
}>;

export async function listAuditEntries(
  session: AuthenticatedSession,
  campaignId: string,
  limit = 100,
): Promise<AuditEntry[]> {
  requirePermission(session.principal, "audit:read", {
    kind: "campaign",
    campaignId,
  });
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.trunc(limit), 1), 200)
    : 100;
  const result = await getD1()
    .prepare(
      `SELECT a.*, u.display_name AS actor_name
       FROM audit_log a
       LEFT JOIN iam_users u ON u.id = a.actor_user_id
       WHERE a.campaign_id = ?
       ORDER BY a.created_at DESC
       LIMIT ?`,
    )
    .bind(campaignId, safeLimit)
    .all<AuditRow>();
  return result.results.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    campaignId: row.campaign_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    correlationId: row.correlation_id,
    details: parseDetails(row.details_json),
    createdAt: toIsoDateTime(row.created_at)!,
  }));
}

function parseDetails(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
