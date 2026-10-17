import { hasPermission, requirePermission } from "@ordem/authz";
import type {
  CreateSessionSummaryInput,
  SessionSummary,
  SessionSummaryStatus,
  UpdateSessionSummaryInput,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import { prepareAuditAfterChange, prepareOutboxEventAfterChange } from "@/server/shared/audit";
import type { AuthenticatedSession } from "@/server/identity/session";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";
import { requireCampaignVisible } from "./campaigns";

type SummaryRow = Readonly<{
  id: string; campaign_id: string; session_id: string | null; session_title: string | null;
  mission_id: string | null; mission_title: string | null; author_user_id: string;
  author_name: string; title: string; body: string; status: SessionSummaryStatus;
  source: "manual" | "automation"; reviewed_by: string | null; published_at: string | null;
  version: number; created_at: string; updated_at: string;
}>;

/** Quem cuida do Diário na gestão: lê tudo, inclusive com o Diário fechado. */
function isDiaryManager(session: AuthenticatedSession | null, campaignId: string): boolean {
  return Boolean(session && (
    hasPermission(session.principal, "session:manage", { kind: "campaign", campaignId }) ||
    hasPermission(session.principal, "post:review", { kind: "campaign", campaignId }) ||
    hasPermission(session.principal, "post:publish", { kind: "campaign", campaignId }) ||
    hasPermission(session.principal, "post:delete", { kind: "campaign", campaignId })
  ));
}

/**
 * O Diário pode ficar fechado aos jogadores (`campaigns.diary_public`); nesse
 * caso só a gestão o lê. Campanha inexistente conta como fechada.
 */
export async function diaryAccess(
  campaignId: string,
  session: AuthenticatedSession | null,
): Promise<{ visible: boolean; openToPlayers: boolean }> {
  const row = await getD1()
    .prepare("SELECT diary_public FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<{ diary_public: number }>();
  const openToPlayers = Boolean(row?.diary_public);
  return { visible: openToPlayers || isDiaryManager(session, campaignId), openToPlayers };
}

export async function listSessionSummaries(
  campaignId: string,
  session: AuthenticatedSession | null,
  includeEditorial: boolean,
): Promise<SessionSummary[]> {
  await requireCampaignVisible(campaignId, session);
  if (!(await diaryAccess(campaignId, session)).visible) {
    throw new HttpError(403, "diary_restricted", "O Diário de Sessões está reservado à gestão por enquanto.");
  }
  const canSeeAll = isDiaryManager(session, campaignId);
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
  const status: SessionSummaryStatus = "draft";
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
  if (input.title !== undefined || input.body !== undefined) {
    requireSummaryEditor(session, existing.campaign_id);
    if (existing.status === "published" || existing.status === "archived") {
      throw new HttpError(409, "summary_not_editable", "Restaure o resumo como rascunho antes de alterar o conteúdo.");
    }
  }
  if (input.status === existing.status) {
    throw new HttpError(409, "invalid_status_transition", "Mudança editorial inválida.");
  }
  if (input.status) {
    assertSummaryTransition(session, existing.campaign_id, existing.status, input.status);
  }
  const db = getD1();
  const result = await db.batch([
    db.prepare(`UPDATE session_summaries SET title = COALESCE(?, title), body = COALESCE(?, body),
      status = COALESCE(?, status),
      reviewed_by = CASE
        WHEN ? = 1 THEN ?
        WHEN ? = 1 THEN NULL
        ELSE reviewed_by
      END,
      published_at = CASE
        WHEN ? = 1 THEN CURRENT_TIMESTAMP
        WHEN ? = 1 THEN NULL
        ELSE published_at
      END,
      version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?`)
      .bind(
        input.title ?? null,
        input.body ?? null,
        input.status ?? null,
        input.status === "published" ? 1 : 0,
        input.status === "published" ? session.user.id : null,
        input.status === "draft" ? 1 : 0,
        input.status === "published" ? 1 : 0,
        input.status === "draft" ? 1 : 0,
        summaryId,
        input.version,
      ),
    prepareAuditAfterChange(db, { actorUserId: session.user.id, campaignId: existing.campaign_id, action: input.status ? `session_summary.${input.status}` : "session_summary.updated", entityType: "session_summary", entityId: summaryId, correlationId, details: { fields: Object.keys(input).filter((key) => key !== "version") } }),
    prepareOutboxEventAfterChange(db, { aggregateType: "session_summary", aggregateId: summaryId, eventType: input.status ? `session_summary.${input.status}` : "session_summary.updated", payload: { summaryId, campaignId: existing.campaign_id } }),
  ]);
  if ((result[0]?.meta.changes ?? 0) === 0) throw new HttpError(409, "version_conflict", "O resumo foi alterado por outra pessoa.");
  return getSessionSummary(summaryId, session, true);
}

export async function deleteSessionSummary(
  session: AuthenticatedSession,
  campaignId: string,
  summaryId: string,
  version: number,
  correlationId: string,
): Promise<void> {
  const existing = await getSummaryRow(summaryId);
  if (existing.campaign_id !== campaignId) throw new HttpError(404, "session_summary_not_found", "Resumo de sessão não encontrado.");
  requirePermission(session.principal, "post:delete", { kind: "campaign", campaignId });
  if (existing.status !== "archived") throw new HttpError(409, "summary_must_be_archived", "Arquive o resumo antes de excluí-lo permanentemente.");
  const db = getD1();
  const summaryExistsAtVersion =
    "EXISTS (SELECT 1 FROM session_summaries WHERE id = ? AND campaign_id = ? AND version = ?)";
  const results = await db.batch([
    db.prepare(`DELETE FROM outbox_events
      WHERE aggregate_type = 'session_summary' AND aggregate_id = ?
        AND ${summaryExistsAtVersion}`).bind(summaryId, summaryId, campaignId, version),
    db.prepare(`DELETE FROM audit_log
      WHERE entity_type = 'session_summary' AND entity_id = ?
        AND ${summaryExistsAtVersion}`).bind(summaryId, summaryId, campaignId, version),
    db.prepare("DELETE FROM session_summaries WHERE id = ? AND campaign_id = ? AND version = ?")
      .bind(summaryId, campaignId, version),
  ]);
  if ((results[2]?.meta.changes ?? 0) === 0) throw new HttpError(409, "version_conflict", "O resumo foi alterado por outra pessoa.");
  await prepareAuditAfterChange(db, { actorUserId: session.user.id, campaignId, action: "session_summary.deleted_permanently", entityType: "session_summary", entityId: summaryId, correlationId, details: { source: existing.source } }).run();
}

async function getSessionSummary(id: string, session: AuthenticatedSession | null, editorial: boolean): Promise<SessionSummary> {
  const row = await getSummaryRow(id);
  if (row.status !== "published" && (!editorial || !session || (!hasPermission(session.principal, "session:manage", { kind: "campaign", campaignId: row.campaign_id }) && !hasPermission(session.principal, "post:review", { kind: "campaign", campaignId: row.campaign_id }) && !hasPermission(session.principal, "post:publish", { kind: "campaign", campaignId: row.campaign_id }) && !hasPermission(session.principal, "post:delete", { kind: "campaign", campaignId: row.campaign_id }) && row.author_user_id !== session.user.id))) {
    throw new HttpError(404, "session_summary_not_found", "Resumo de sessão não encontrado.");
  }
  return mapSummary(row);
}

function requireSummaryEditor(session: AuthenticatedSession, campaignId: string): void {
  if (
    hasPermission(session.principal, "session:manage", { kind: "campaign", campaignId }) ||
    hasPermission(session.principal, "post:review", { kind: "campaign", campaignId })
  ) return;
  requirePermission(session.principal, "session:manage", { kind: "campaign", campaignId });
}

function assertSummaryTransition(
  session: AuthenticatedSession,
  campaignId: string,
  current: SessionSummaryStatus,
  next: SessionSummaryStatus,
): void {
  const allowed: Readonly<Record<SessionSummaryStatus, readonly SessionSummaryStatus[]>> = {
    draft: ["pending_review", "archived"],
    pending_review: ["draft", "published", "archived"],
    published: ["archived"],
    archived: ["draft"],
  };
  if (!allowed[current].includes(next)) {
    throw new HttpError(409, "invalid_status_transition", "Mudança editorial inválida.");
  }
  if (next === "pending_review" || (current === "pending_review" && next === "draft")) {
    requireSummaryEditor(session, campaignId);
  }
  if (next === "published" || next === "archived" || current === "archived") {
    requirePermission(session.principal, "post:publish", { kind: "campaign", campaignId });
  }
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
