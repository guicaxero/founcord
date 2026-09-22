import { requirePermission } from "@ordem/authz";
import type {
  AutomationDraftCallback,
  AutomationDraftCallbackResponse,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import { prepareAudit, prepareOutboxEvent } from "@/server/shared/audit";
import { getSessionForUserId } from "@/server/identity/session";
import { HttpError } from "@/server/shared/http";

type DraftLinkRow = Readonly<{
  post_id: string | null;
  summary_id: string | null;
}>;

export async function createAutomationDraft(
  input: AutomationDraftCallback,
  correlationId: string,
): Promise<AutomationDraftCallbackResponse> {
  const existing = await findDraftLink(input.jobId);
  if (existing) {
    return { postId: existing.post_id, summaryId: existing.summary_id, status: "pending_review", duplicate: true };
  }

  const session = await getSessionForUserId(input.requestedByUserId);
  if (!session) {
    throw new HttpError(
      403,
      "automation_requester_unavailable",
      "A pessoa que solicitou a automação não está mais disponível.",
    );
  }
  requirePermission(session.principal, "automation:run", {
    kind: "campaign",
    campaignId: input.campaignId,
  });

  const campaign = await getD1()
    .prepare("SELECT status FROM campaigns WHERE id = ?")
    .bind(input.campaignId)
    .first<{ status: "draft" | "active" | "archived" }>();
  if (!campaign) {
    throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
  }
  if (campaign.status === "archived") {
    throw new HttpError(
      409,
      "campaign_archived",
      "Reative a campanha antes de gerar conteúdo.",
    );
  }

  const db = getD1();
  const target = input.target;
  const summaryId = target.type === "session_summary" ? crypto.randomUUID() : null;
  const postId = target.type === "post" ? crypto.randomUUID() : null;
  if (target.type === "session_summary") {
    const sessionExists = await db
      .prepare("SELECT 1 AS found FROM campaign_sessions WHERE id = ? AND campaign_id = ? AND status = 'ended'")
      .bind(target.sessionId, input.campaignId)
      .first<{ found: number }>();
    if (!sessionExists) {
      throw new HttpError(422, "session_summary_target_invalid", "A sessão do resumo não está encerrada ou não pertence à campanha.");
    }
  }
  try {
    const statements = target.type === "session_summary"
      ? [
          db.prepare(`INSERT INTO session_summaries (id, campaign_id, session_id, author_user_id, title, body, source, status)
            VALUES (?, ?, ?, ?, ?, ?, 'automation', 'pending_review')`).bind(summaryId, input.campaignId, target.sessionId, input.requestedByUserId, input.title, input.body),
          db.prepare(`INSERT INTO automation_session_summary_links (job_id, campaign_id, session_id, summary_id, requested_by_user_id)
            VALUES (?, ?, ?, ?, ?)`).bind(input.jobId, input.campaignId, target.sessionId, summaryId, input.requestedByUserId),
        ]
      : [
          db.prepare(`INSERT INTO posts (id, campaign_id, author_user_id, title, body, source, status)
            VALUES (?, ?, ?, ?, ?, 'automation', 'pending_review')`).bind(postId, input.campaignId, input.requestedByUserId, input.title, input.body),
          db.prepare(`INSERT INTO automation_draft_links (job_id, campaign_id, post_id, requested_by_user_id)
            VALUES (?, ?, ?, ?)`).bind(input.jobId, input.campaignId, postId, input.requestedByUserId),
        ];
    await db.batch([
      ...statements,
      prepareAudit(db, {
        actorUserId: input.requestedByUserId,
        campaignId: input.campaignId,
        action: "automation.draft.created",
        entityType: target.type === "session_summary" ? "session_summary" : "post",
        entityId: summaryId ?? postId!,
        correlationId,
        details: { jobId: input.jobId, kind: input.kind, model: input.model },
      }),
      prepareOutboxEvent(db, {
        aggregateType: target.type === "session_summary" ? "session_summary" : "post",
        aggregateId: summaryId ?? postId!,
        eventType: target.type === "session_summary" ? "session_summary.pending_review" : "post.pending_review",
        payload: {
          ...(postId ? { postId } : { summaryId }),
          campaignId: input.campaignId,
          source: "automation",
          jobId: input.jobId,
        },
      }),
    ]);
  } catch (error) {
    const duplicate = await findDraftLink(input.jobId);
    if (duplicate) {
      return { postId: duplicate.post_id, summaryId: duplicate.summary_id, status: "pending_review", duplicate: true };
    }
    throw error;
  }
  return { postId, summaryId, status: "pending_review", duplicate: false };
}

async function findDraftLink(jobId: string): Promise<DraftLinkRow | null> {
  return getD1()
    .prepare(
      `SELECT l.post_id, NULL AS summary_id
       FROM automation_draft_links l
       JOIN posts p ON p.id = l.post_id
       WHERE l.job_id = ?
       UNION ALL
       SELECT NULL AS post_id, l.summary_id
       FROM automation_session_summary_links l
       JOIN session_summaries s ON s.id = l.summary_id
       WHERE l.job_id = ?`,
    )
    .bind(jobId, jobId)
    .first<DraftLinkRow>();
}
