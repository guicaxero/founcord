import { hasPermission, requirePermission } from "@vigilia/authz";
import type {
  CreateSessionSummaryInput,
  SessionSummary,
  SessionSummaryStatus,
  UpdateSessionSummaryInput,
} from "@vigilia/contracts";
import { getD1 } from "@/db";
import { prepareAuditAfterChange, prepareOutboxEventAfterChange } from "../audit";
import type { AuthenticatedSession } from "../auth/session";
import { HttpError } from "../http";
import { toIsoDateTime } from "../time";
import { requireCampaignVisible } from "./campaigns";

type SummaryRow = Readonly<{
  id: string; campaign_id: string; session_id: string | null; session_title: string | null;
  mission_id: string | null; mission_title: string | null; author_user_id: string;
  author_name: string; title: string; body: string; status: SessionSummaryStatus;
  source: "manual" | "automation"; reviewed_by: string | null; published_at: string | null;
  version: number; created_at: string; updated_at: string;
}>;

export async function listSessionSummaries(
  campaignId: string,
  session: AuthenticatedSession | null,
  includeEditorial: boolean,
): Promise<SessionSummary[]> {
  await requireCampaignVisible(campaignId, session);
  const canSeeAll = Boolean(session && hasPermission(session.principal, "session:manage", { kind: "campaign", campaignId }));
  const result = await getD1().prepare(
    `SELECT ss.*, u.display_name AS author_name, cs.title AS session_title,
            m.id AS mission_id, m.title AS mission_title
       FROM session_summaries ss
       JOIN iam_users u ON u.id = ss.author_user_id
       LEFT JOIN campaign_sessions cs ON cs.id = ss.session_id
       LEFT JOIN missions m ON m.id = cs.mission_id
      WHERE ss.campaign_id = ?
        AND (ss.status = 'published' OR (? = 1 AND (ss.author_user_id = ? OR ? = 1)))
      ORDER BY COALESCE(ss.published_at, ss.updated_at) DESC`,
  ).bind(campaignId, includeEditorial ? 1 : 0, session?.user.id ?? "", canSeeAll ? 1 : 0).all<SummaryRow>();
  return result.results.map(mapSummary);
}

export async function createSessionSummary(
  session: AuthenticatedSession,
  input: CreateSessionSummaryInput,
  correlationId: string,
): Promise<SessionSummary> {
  requirePermission(session.principal, "session:manage", { kind: "campaign", campaignId: input.campaignId });
  await assertSessionScope(input.campaignId, input.sessionId);
  const id = crypto.randomUUID();
  const status = input.status === "published" ? "draft" : input.status;
  const db = getD1();
  await db.batch([
    db.prepare(`INSERT INTO session_summaries (id, campaign_id, session_id, author_user_id, title, body, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, input.campaignId, input.sessionId, session.user.id, input.title, input.body, status),
    prepareAuditAfterChange(db, { actorUserId: session.user.id, campaignId: input.campaignId, action: "session_summary.created", entityType: "session_summary", entityId: id, correlationId, details: { sessionId: input.sessionId, status } }),
    prepareOutboxEventAfterChange(db, { aggregateType: "session_summary", aggregateId: id, eventType: "session_summary.created", payload: { summaryId: id, campaignId: input.campaignId } }),
  ]);
  return getSessionSummary(id, session, true);
}

export async function updateSessionSummary(
  session: AuthenticatedSession,
  campaignId: string,
  summaryId: string,
  input: UpdateSessionSummaryInput,
  correlationId: string,
): Promise<SessionSummary> {
  const existing = await getSummaryRow(summaryId);
  if (existing.campaign_id !== campaignId) {
    throw new HttpError(404, "session_summary_not_found", "Resumo de sessão não encontrado.");
  }
  requirePermission(session.principal, "session:manage", { kind: "campaign", campaignId: existing.campaign_id });
  if (input.status === "published" || input.status === "archived") {
    requirePermission(session.principal, "post:publish", { kind: "campaign", campaignId: existing.campaign_id });
  }
  if (input.status === "published" && existing.status !== "pending_review") {
    throw new HttpError(409, "summary_not_ready", "Envie o resumo para revisão antes de publicá-lo.");
  }
  const db = getD1();
  const result = await db.batch([
    db.prepare(`UPDATE session_summaries SET title = COALESCE(?, title), body = COALESCE(?, body),
      status = COALESCE(?, status), reviewed_by = CASE WHEN ? = 1 THEN ? ELSE reviewed_by END,
      published_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE published_at END,
      version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?`)
      .bind(input.title ?? null, input.body ?? null, input.status ?? null, input.status === "published" ? 1 : 0, input.status === "published" ? session.user.id : null, input.status === "published" ? 1 : 0, summaryId, input.version),
    prepareAuditAfterChange(db, { actorUserId: session.user.id, campaignId: existing.campaign_id, action: input.status ? `session_summary.${input.status}` : "session_summary.updated", entityType: "session_summary", entityId: summaryId, correlationId, details: { fields: Object.keys(input).filter((key) => key !== "version") } }),
    prepareOutboxEventAfterChange(db, { aggregateType: "session_summary", aggregateId: summaryId, eventType: input.status ? `session_summary.${input.status}` : "session_summary.updated", payload: { summaryId, campaignId: existing.campaign_id } }),
  ]);
  if ((result[0]?.meta.changes ?? 0) === 0) throw new HttpError(409, "version_conflict", "O resumo foi alterado por outra pessoa.");
  return getSessionSummary(summaryId, session, true);
}

async function getSessionSummary(id: string, session: AuthenticatedSession | null, editorial: boolean): Promise<SessionSummary> {
  const row = await getSummaryRow(id);
  if (row.status !== "published" && (!editorial || !session || (!hasPermission(session.principal, "session:manage", { kind: "campaign", campaignId: row.campaign_id }) && row.author_user_id !== session.user.id))) {
    throw new HttpError(404, "session_summary_not_found", "Resumo de sessão não encontrado.");
  }
  return mapSummary(row);
}

async function getSummaryRow(id: string): Promise<SummaryRow> {
  const row = await getD1().prepare(`SELECT ss.*, u.display_name AS author_name, cs.title AS session_title,
      m.id AS mission_id, m.title AS mission_title FROM session_summaries ss
      JOIN iam_users u ON u.id = ss.author_user_id LEFT JOIN campaign_sessions cs ON cs.id = ss.session_id
      LEFT JOIN missions m ON m.id = cs.mission_id WHERE ss.id = ?`).bind(id).first<SummaryRow>();
  if (!row) throw new HttpError(404, "session_summary_not_found", "Resumo de sessão não encontrado.");
  return row;
}

async function assertSessionScope(campaignId: string, sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  const found = await getD1().prepare("SELECT 1 AS found FROM campaign_sessions WHERE id = ? AND campaign_id = ?").bind(sessionId, campaignId).first<{ found: number }>();
  if (!found) throw new HttpError(422, "session_scope_mismatch", "A sessão não pertence à campanha.");
}

function mapSummary(row: SummaryRow): SessionSummary {
  return {
    id: row.id, campaignId: row.campaign_id, sessionId: row.session_id,
    sessionTitle: row.session_title,
    mission: row.mission_id && row.mission_title ? { id: row.mission_id, title: row.mission_title } : null,
    authorUserId: row.author_user_id, authorName: row.author_name, title: row.title, body: row.body,
    status: row.status, source: row.source, reviewedBy: row.reviewed_by,
    publishedAt: toIsoDateTime(row.published_at), version: row.version,
    createdAt: toIsoDateTime(row.created_at)!, updatedAt: toIsoDateTime(row.updated_at)!,
  };
}
