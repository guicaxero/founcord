import { requirePermission } from "@vigilia/authz";
import type {
  AutomationDraftCallback,
  AutomationDraftCallbackResponse,
} from "@vigilia/contracts";
import { getD1 } from "@/db";
import { prepareAudit, prepareOutboxEvent } from "@/server/audit";
import { getSessionForUserId } from "@/server/auth/session";
import { HttpError } from "@/server/http";

type DraftLinkRow = Readonly<{
  post_id: string;
}>;

export async function createAutomationDraft(
  input: AutomationDraftCallback,
  correlationId: string,
): Promise<AutomationDraftCallbackResponse> {
  const existing = await findDraftLink(input.jobId);
  if (existing) {
    return { postId: existing.post_id, status: "pending_review", duplicate: true };
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
  const postId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO posts (
            id, campaign_id, author_user_id, title, body, source, status
          ) VALUES (?, ?, ?, ?, ?, 'automation', 'pending_review')`,
        )
        .bind(
          postId,
          input.campaignId,
          input.requestedByUserId,
          input.title,
          input.body,
        ),
      db
        .prepare(
          `INSERT INTO automation_draft_links (
            job_id, campaign_id, post_id, requested_by_user_id
          ) VALUES (?, ?, ?, ?)`,
        )
        .bind(input.jobId, input.campaignId, postId, input.requestedByUserId),
      prepareAudit(db, {
        actorUserId: input.requestedByUserId,
        campaignId: input.campaignId,
        action: "automation.draft.created",
        entityType: "post",
        entityId: postId,
        correlationId,
        details: { jobId: input.jobId, kind: input.kind, model: input.model },
      }),
      prepareOutboxEvent(db, {
        aggregateType: "post",
        aggregateId: postId,
        eventType: "post.pending_review",
        payload: {
          postId,
          campaignId: input.campaignId,
          source: "automation",
          jobId: input.jobId,
        },
      }),
    ]);
  } catch (error) {
    const duplicate = await findDraftLink(input.jobId);
    if (duplicate) {
      return { postId: duplicate.post_id, status: "pending_review", duplicate: true };
    }
    throw error;
  }
  return { postId, status: "pending_review", duplicate: false };
}

async function findDraftLink(jobId: string): Promise<DraftLinkRow | null> {
  return getD1()
    .prepare(
      `SELECT l.post_id
       FROM automation_draft_links l
       JOIN posts p ON p.id = l.post_id
       WHERE l.job_id = ?`,
    )
    .bind(jobId)
    .first<DraftLinkRow>();
}
