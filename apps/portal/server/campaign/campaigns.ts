import { hasPermission, requirePermission } from "@ordem/authz";
import type {
  AddCampaignMemberInput,
  Campaign,
  CampaignMember,
  CreateCampaignInput,
  UpdateCampaignInput,
  UpdateCampaignMemberInput,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import {
  prepareAudit,
  prepareAuditAfterChange,
  prepareOutboxEvent,
  prepareOutboxEventAfterChange,
} from "@/server/shared/audit";
import type { AuthenticatedSession } from "@/server/identity/session";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";

type CampaignRow = Readonly<{
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  is_public: number;
  diary_public: number;
  version: number;
  created_at: string;
  updated_at: string;
  active_member_id?: string | null;
}>;

type MemberRow = Readonly<{
  campaign_id: string;
  user_id: string;
  discord_user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: "active" | "suspended" | "left";
  joined_at: string;
  roles: string | null;
}>;

export async function listCampaigns(
  session: AuthenticatedSession | null,
): Promise<Campaign[]> {
  const db = getD1();
  const query = session
    ? db
        .prepare(
          `SELECT DISTINCT c.*, cm.user_id AS active_member_id FROM campaigns c
           LEFT JOIN campaign_members cm
             ON cm.campaign_id = c.id AND cm.user_id = ? AND cm.status = 'active'
           ORDER BY c.name`,
        )
        .bind(session.user.id)
    : db.prepare(
        `SELECT * FROM campaigns
         WHERE status = 'active' AND is_public = 1
         ORDER BY name`,
      );
  const result = await query.all<CampaignRow>();
  return result.results
    .filter(
      (campaign) =>
        (campaign.status === "active" &&
          (Boolean(campaign.is_public) || Boolean(campaign.active_member_id))) ||
        canManageCampaign(session, campaign.id),
    )
    .map(mapCampaign);
}

export async function getCampaign(
  campaignId: string,
  session: AuthenticatedSession | null,
): Promise<Campaign> {
  const row = await getCampaignRow(campaignId);
  const canManage = canManageCampaign(session, campaignId);
  if (row.status !== "active" && !canManage) {
    throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
  }
  if (
    !row.is_public &&
    !canManage &&
    !(session && (await isActiveCampaignMember(campaignId, session.user.id)))
  ) {
    throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
  }
  return mapCampaign(row);
}

export async function requireCampaignVisible(
  campaignId: string,
  session: AuthenticatedSession | null,
): Promise<void> {
  await getCampaign(campaignId, session);
}

async function getCampaignRow(campaignId: string): Promise<CampaignRow> {
  const row = await getD1()
    .prepare("SELECT * FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<CampaignRow>();
  if (!row) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
  return row;
}

export async function createCampaign(
  session: AuthenticatedSession,
  input: CreateCampaignInput,
  correlationId: string,
): Promise<Campaign> {
  requirePermission(session.principal, "campaign:manage", { kind: "global" });
  const db = getD1();
  const id = crypto.randomUUID();
  const roleAssignmentId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaigns (
            id, slug, name, description, status, is_public
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.slug,
          input.name,
          input.description,
          input.status,
          input.isPublic ? 1 : 0,
        ),
      db
        .prepare(
          `INSERT INTO campaign_members (campaign_id, user_id, status)
           VALUES (?, ?, 'active')`,
        )
        .bind(id, session.user.id),
      db
        .prepare(
          `INSERT INTO iam_role_assignments (
            id, user_id, role_name, scope_kind, scope_id, granted_by
          ) VALUES (?, ?, 'campaign_manager', 'campaign', ?, ?)`,
        )
        .bind(roleAssignmentId, session.user.id, id, session.user.id),
      prepareAudit(db, {
        actorUserId: session.user.id,
        campaignId: id,
        action: "campaign.created",
        entityType: "campaign",
        entityId: id,
        correlationId,
        details: { slug: input.slug },
      }),
      prepareOutboxEvent(db, {
        aggregateType: "campaign",
        aggregateId: id,
        eventType: "campaign.created",
        payload: { campaignId: id },
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new HttpError(409, "campaign_slug_conflict", "Este endereço de campanha já existe.");
    }
    throw error;
  }
  return mapCampaign(await getCampaignRow(id));
}

export async function updateCampaign(
  session: AuthenticatedSession,
  campaignId: string,
  input: UpdateCampaignInput,
  correlationId: string,
): Promise<Campaign> {
  requirePermission(session.principal, "campaign:manage", {
    kind: "campaign",
    campaignId,
  });
  const db = getD1();
  let results;
  try {
    results = await db.batch([
      db.prepare(
        `UPDATE campaigns SET
          slug = COALESCE(?, slug),
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          is_public = COALESCE(?, is_public),
          diary_public = COALESCE(?, diary_public),
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(
        input.slug ?? null,
        input.name ?? null,
        input.description ?? null,
        input.status ?? null,
        input.isPublic === undefined ? null : input.isPublic ? 1 : 0,
        input.diaryPublic === undefined ? null : input.diaryPublic ? 1 : 0,
        campaignId,
        input.version,
      ),
      prepareAuditAfterChange(db, {
        actorUserId: session.user.id,
        campaignId,
        action: "campaign.updated",
        entityType: "campaign",
        entityId: campaignId,
        correlationId,
        details: { fields: Object.keys(input).filter((key) => key !== "version") },
      }),
      prepareOutboxEventAfterChange(db, {
        aggregateType: "campaign",
        aggregateId: campaignId,
        eventType: "campaign.updated",
        payload: { campaignId },
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new HttpError(409, "campaign_slug_conflict", "Este endereço de campanha já existe.");
    }
    throw error;
  }
  if ((results[0]?.meta.changes ?? 0) === 0) {
    await assertCampaignVersion(campaignId);
    throw new HttpError(409, "version_conflict", "A campanha foi alterada por outra pessoa.");
  }
  return mapCampaign(await getCampaignRow(campaignId));
}

export async function listMembers(
  session: AuthenticatedSession,
  campaignId: string,
): Promise<CampaignMember[]> {
  requirePermission(session.principal, "member:manage", {
    kind: "campaign",
    campaignId,
  });
  const result = await getD1()
    .prepare(
      `SELECT
        cm.campaign_id, cm.user_id, cm.status, cm.joined_at,
        u.discord_user_id, u.display_name, u.avatar_url,
        GROUP_CONCAT(ra.role_name) AS roles
       FROM campaign_members cm
       JOIN iam_users u ON u.id = cm.user_id
       LEFT JOIN iam_role_assignments ra
         ON ra.user_id = cm.user_id
        AND ra.scope_kind = 'campaign'
        AND ra.scope_id = cm.campaign_id
       WHERE cm.campaign_id = ?
       GROUP BY cm.campaign_id, cm.user_id
       ORDER BY u.display_name`,
    )
    .bind(campaignId)
    .all<MemberRow>();
  return result.results.map(mapMember);
}

export async function addMember(
  session: AuthenticatedSession,
  campaignId: string,
  input: AddCampaignMemberInput,
  correlationId: string,
): Promise<CampaignMember> {
  requirePermission(session.principal, "member:manage", {
    kind: "campaign",
    campaignId,
  });
  if (input.role !== "player") {
    requirePermission(session.principal, "role:assign", {
      kind: "campaign",
      campaignId,
    });
  }
  const db = getD1();
  const user = await db
    .prepare("SELECT id FROM iam_users WHERE discord_user_id = ?")
    .bind(input.discordUserId)
    .first<{ id: string }>();
  if (!user) {
    throw new HttpError(
      404,
      "user_not_found",
      "Esse usuário precisa entrar no portal pelo Discord antes de ser adicionado.",
    );
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO campaign_members (campaign_id, user_id, status)
         VALUES (?, ?, 'active')
         ON CONFLICT(campaign_id, user_id) DO UPDATE SET status = 'active'`,
      )
      .bind(campaignId, user.id),
    db
      .prepare(
        `INSERT INTO iam_role_assignments (
          id, user_id, role_name, scope_kind, scope_id, granted_by
        ) VALUES (?, ?, ?, 'campaign', ?, ?)
        ON CONFLICT(user_id, role_name, scope_kind, scope_id) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        input.role,
        campaignId,
        session.user.id,
      ),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "member.added",
      entityType: "user",
      entityId: user.id,
      correlationId,
      details: { role: input.role },
    }),
  ]);
  return getMember(campaignId, user.id);
}

export async function updateMember(
  session: AuthenticatedSession,
  campaignId: string,
  userId: string,
  input: UpdateCampaignMemberInput,
  correlationId: string,
): Promise<CampaignMember> {
  requirePermission(session.principal, "member:manage", {
    kind: "campaign",
    campaignId,
  });
  if (input.role || input.removeRole) {
    requirePermission(session.principal, "role:assign", {
      kind: "campaign",
      campaignId,
    });
  }
  await getMember(campaignId, userId);
  const db = getD1();
  const statements = [];
  if (input.status) {
    statements.push(
      db
        .prepare(
          `UPDATE campaign_members SET status = ?
           WHERE campaign_id = ? AND user_id = ?`,
        )
        .bind(input.status, campaignId, userId),
    );
  }
  if (input.role) {
    statements.push(
      db
        .prepare(
          `INSERT INTO iam_role_assignments (
            id, user_id, role_name, scope_kind, scope_id, granted_by
          ) VALUES (?, ?, ?, 'campaign', ?, ?)
          ON CONFLICT(user_id, role_name, scope_kind, scope_id) DO NOTHING`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          input.role,
          campaignId,
          session.user.id,
        ),
    );
  }
  if (input.removeRole) {
    statements.push(
      db
        .prepare(
          `DELETE FROM iam_role_assignments
           WHERE user_id = ? AND role_name = ?
             AND scope_kind = 'campaign' AND scope_id = ?`,
        )
        .bind(userId, input.removeRole, campaignId),
    );
  }
  statements.push(
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "member.updated",
      entityType: "user",
      entityId: userId,
      correlationId,
      details: input,
    }),
  );
  await db.batch(statements);
  return getMember(campaignId, userId);
}

export function canManageCampaign(
  session: AuthenticatedSession | null,
  campaignId: string,
): boolean {
  return Boolean(
    session &&
      hasPermission(session.principal, "campaign:manage", {
        kind: "campaign",
        campaignId,
      }),
  );
}

async function isActiveCampaignMember(
  campaignId: string,
  userId: string,
): Promise<boolean> {
  const membership = await getD1()
    .prepare(
      `SELECT 1 AS active FROM campaign_members
       WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
    )
    .bind(campaignId, userId)
    .first<{ active: number }>();
  return Boolean(membership);
}

async function getMember(campaignId: string, userId: string): Promise<CampaignMember> {
  const result = await getD1()
    .prepare(
      `SELECT
        cm.campaign_id, cm.user_id, cm.status, cm.joined_at,
        u.discord_user_id, u.display_name, u.avatar_url,
        GROUP_CONCAT(ra.role_name) AS roles
       FROM campaign_members cm
       JOIN iam_users u ON u.id = cm.user_id
       LEFT JOIN iam_role_assignments ra
         ON ra.user_id = cm.user_id AND ra.scope_kind = 'campaign'
        AND ra.scope_id = cm.campaign_id
       WHERE cm.campaign_id = ? AND cm.user_id = ?
       GROUP BY cm.campaign_id, cm.user_id`,
    )
    .bind(campaignId, userId)
    .first<MemberRow>();
  if (!result) throw new HttpError(404, "member_not_found", "Membro não encontrado.");
  return mapMember(result);
}

async function assertCampaignVersion(campaignId: string): Promise<void> {
  const exists = await getD1()
    .prepare("SELECT id FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first();
  if (!exists) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    isPublic: Boolean(row.is_public),
    diaryPublic: Boolean(row.diary_public),
    version: row.version,
    createdAt: toIsoDateTime(row.created_at)!,
    updatedAt: toIsoDateTime(row.updated_at)!,
  };
}

function mapMember(row: MemberRow): CampaignMember {
  return {
    campaignId: row.campaign_id,
    user: {
      id: row.user_id,
      discordUserId: row.discord_user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
    status: row.status,
    roles: row.roles?.split(",").filter(Boolean) ?? [],
    joinedAt: toIsoDateTime(row.joined_at)!,
  };
}
