import { hasPermission, requirePermission } from "@vigilia/authz";
import type {
  CreatePostInput,
  Post,
  PostStatus,
  UpdatePostInput,
} from "@vigilia/contracts";
import { getD1 } from "@/db";
import {
  prepareAuditAfterChange,
  prepareOutboxEventAfterChange,
} from "../audit";
import type { AuthenticatedSession } from "../auth/session";
import { HttpError } from "../http";
import { toIsoDateTime } from "../time";
import { requireCampaignVisible } from "./campaigns";

type PostRow = Readonly<{
  id: string;
  campaign_id: string;
  author_user_id: string;
  author_name: string;
  title: string;
  body: string;
  status: PostStatus;
  source: "manual" | "discord" | "foundry" | "automation";
  reviewed_by: string | null;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}>;

export async function listPosts(
  campaignId: string,
  session: AuthenticatedSession | null,
  includeEditorial: boolean,
): Promise<Post[]> {
  await requireCampaignVisible(campaignId, session);
  const canCreate = Boolean(
    session &&
      hasPermission(session.principal, "post:create", {
        kind: "campaign",
        campaignId,
      }),
  );
  const canSeeAll = Boolean(
    session &&
      (hasPermission(session.principal, "post:review", {
        kind: "campaign",
        campaignId,
      }) ||
        hasPermission(session.principal, "post:publish", {
          kind: "campaign",
          campaignId,
        })),
  );
  const userId = session?.user.id ?? "";
  const result = await getD1()
    .prepare(
      `SELECT p.*, u.display_name AS author_name
       FROM posts p
       JOIN iam_users u ON u.id = p.author_user_id
       WHERE p.campaign_id = ? AND (
         p.status = 'published'
         OR (? = 1)
         OR (? = 1 AND p.author_user_id = ?)
       )
       ORDER BY COALESCE(p.published_at, p.updated_at) DESC`,
    )
    .bind(
      campaignId,
      includeEditorial && canSeeAll ? 1 : 0,
      includeEditorial && canCreate ? 1 : 0,
      userId,
    )
    .all<PostRow>();
  return result.results.map(mapPost);
}

export async function createPost(
  session: AuthenticatedSession,
  input: CreatePostInput,
  correlationId: string,
): Promise<Post> {
  requirePermission(session.principal, "post:create", {
    kind: "campaign",
    campaignId: input.campaignId,
  });
  const db = getD1();
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO posts (
          id, campaign_id, author_user_id, title, body, source, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
      )
      .bind(
        id,
        input.campaignId,
        session.user.id,
        input.title,
        input.body,
        input.source,
      ),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: input.campaignId,
      action: "post.created",
      entityType: "post",
      entityId: id,
      correlationId,
      details: { source: input.source },
    }),
    prepareOutboxEventAfterChange(db, {
      aggregateType: "post",
      aggregateId: id,
      eventType: "post.created",
      payload: { postId: id, campaignId: input.campaignId },
    }),
  ]);
  return getPost(id, session, true);
}

export async function updatePost(
  session: AuthenticatedSession,
  postId: string,
  input: UpdatePostInput,
  correlationId: string,
): Promise<Post> {
  const existing = await getPostRow(postId);
  const changesContent = input.title !== undefined || input.body !== undefined;
  if (input.status === existing.status && !changesContent) {
    if (input.status === "approved" || input.status === "rejected") {
      requirePermission(session.principal, "post:review", {
        kind: "campaign",
        campaignId: existing.campaign_id,
      });
    } else if (input.status === "published" || input.status === "archived") {
      requirePermission(session.principal, "post:publish", {
        kind: "campaign",
        campaignId: existing.campaign_id,
      });
    } else {
      assertCanEditPost(session, existing);
    }
    throw new HttpError(422, "no_effect", "O post já está nesse estado.");
  }
  if (changesContent || !input.status) {
    assertCanEditPost(session, existing);
  }
  if (input.status && input.status !== existing.status) {
    assertPostTransition(
      session,
      existing.campaign_id,
      existing.status,
      input.status,
    );
  }
  const db = getD1();
  const reviewer =
    input.status === "approved" || input.status === "rejected"
      ? session.user.id
      : null;
  const publishedAt = input.status === "published" ? new Date().toISOString() : null;
  const results = await db.batch([
    db
      .prepare(
        `UPDATE posts SET
          title = COALESCE(?, title),
          body = COALESCE(?, body),
          status = COALESCE(?, status),
          reviewed_by = COALESCE(?, reviewed_by),
          published_at = COALESCE(?, published_at),
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(
        input.title ?? null,
        input.body ?? null,
        input.status ?? null,
        reviewer,
        publishedAt,
        postId,
        input.version,
      ),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: existing.campaign_id,
      action: input.status ? `post.${input.status}` : "post.updated",
      entityType: "post",
      entityId: postId,
      correlationId,
      details: { fields: Object.keys(input).filter((key) => key !== "version") },
    }),
    prepareOutboxEventAfterChange(db, {
      aggregateType: "post",
      aggregateId: postId,
      eventType: input.status ? `post.${input.status}` : "post.updated",
      payload: { postId, campaignId: existing.campaign_id },
    }),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) {
    throw new HttpError(409, "version_conflict", "O post foi alterado por outra pessoa.");
  }
  return getPost(postId, session, true);
}

export async function archivePost(
  session: AuthenticatedSession,
  postId: string,
  version: number,
  correlationId: string,
): Promise<void> {
  const existing = await getPostRow(postId);
  if (existing.status === "archived") {
    throw new HttpError(409, "invalid_status_transition", "O post já está arquivado.");
  }
  requirePermission(session.principal, "post:publish", {
    kind: "campaign",
    campaignId: existing.campaign_id,
  });
  const db = getD1();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE posts SET status = 'archived', version = version + 1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(postId, version),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: existing.campaign_id,
      action: "post.archived",
      entityType: "post",
      entityId: postId,
      correlationId,
    }),
    prepareOutboxEventAfterChange(db, {
      aggregateType: "post",
      aggregateId: postId,
      eventType: "post.archived",
      payload: { postId, campaignId: existing.campaign_id },
    }),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) {
    throw new HttpError(409, "version_conflict", "O post foi alterado por outra pessoa.");
  }
}

export async function getPublishedPostForIntegration(
  postId: string,
): Promise<Post> {
  const row = await getPostRow(postId);
  if (row.status !== "published") {
    throw new HttpError(
      409,
      "post_not_published",
      "O post ainda não foi publicado no portal.",
    );
  }
  return mapPost(row);
}

async function getPost(
  postId: string,
  session: AuthenticatedSession | null,
  allowEditorial: boolean,
): Promise<Post> {
  const row = await getPostRow(postId);
  if (
    row.status !== "published" &&
    (!allowEditorial ||
      !session ||
      (row.author_user_id !== session.user.id &&
        !hasPermission(session.principal, "post:review", {
          kind: "campaign",
          campaignId: row.campaign_id,
        }) &&
        !hasPermission(session.principal, "post:publish", {
          kind: "campaign",
          campaignId: row.campaign_id,
        })))
  ) {
    throw new HttpError(404, "post_not_found", "Post não encontrado.");
  }
  return mapPost(row);
}

async function getPostRow(postId: string): Promise<PostRow> {
  const row = await getD1()
    .prepare(
      `SELECT p.*, u.display_name AS author_name
       FROM posts p JOIN iam_users u ON u.id = p.author_user_id
       WHERE p.id = ?`,
    )
    .bind(postId)
    .first<PostRow>();
  if (!row) throw new HttpError(404, "post_not_found", "Post não encontrado.");
  return row;
}

function assertCanEditPost(session: AuthenticatedSession, post: PostRow) {
  requirePermission(session.principal, "post:create", {
    kind: "campaign",
    campaignId: post.campaign_id,
  });
  if (post.author_user_id !== session.user.id && !hasElevatedPostRole(session, post.campaign_id)) {
    throw new HttpError(403, "own_post_only", "Você edita apenas os próprios rascunhos.");
  }
}

function hasElevatedPostRole(
  session: AuthenticatedSession,
  campaignId: string,
): boolean {
  const elevatedRoles = new Set(["owner", "administrator", "campaign_manager", "editor"]);
  return session.assignments.some(
    (assignment) =>
      elevatedRoles.has(assignment.roleName) &&
      (assignment.scope.kind === "global" ||
        assignment.scope.campaignId === campaignId),
  );
}

function assertPostTransition(
  session: AuthenticatedSession,
  campaignId: string,
  current: PostStatus,
  next: PostStatus,
) {
  const allowed: Readonly<Record<PostStatus, readonly PostStatus[]>> = {
    draft: ["pending_review", "archived"],
    pending_review: ["approved", "rejected", "draft", "archived"],
    approved: ["published", "rejected", "archived"],
    published: ["archived"],
    archived: ["draft"],
    rejected: ["draft", "pending_review", "archived"],
  };
  if (!allowed[current].includes(next)) {
    throw new HttpError(409, "invalid_status_transition", "Mudança editorial inválida.");
  }
  if (next === "approved" || next === "rejected") {
    requirePermission(session.principal, "post:review", {
      kind: "campaign",
      campaignId,
    });
  }
  if (next === "published" || next === "archived") {
    requirePermission(session.principal, "post:publish", {
      kind: "campaign",
      campaignId,
    });
  }
}

function mapPost(row: PostRow): Post {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    status: row.status,
    source: row.source,
    reviewedBy: row.reviewed_by,
    publishedAt: toIsoDateTime(row.published_at),
    version: row.version,
    createdAt: toIsoDateTime(row.created_at)!,
    updatedAt: toIsoDateTime(row.updated_at)!,
  };
}
