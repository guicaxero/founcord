import { hasPermission, requirePermission } from "@ordem/authz";
import type {
  CreateMissionInput,
  MissionOutcome,
  MissionSignup,
  MissionStatus,
  MissionSummary,
  UpdateMissionInput,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import {
  prepareAuditAfterChange,
  prepareOutboxEventAfterChange,
} from "@/server/shared/audit";
import type { AuthenticatedSession } from "@/server/identity/session";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";
import { assertCampaignMedia } from "@/server/media/media";
import { requireCampaignVisible } from "./campaigns";

type MissionRow = Readonly<{
  id: string;
  campaign_id: string;
  author_user_id: string;
  author_name: string;
  title: string;
  summary: string;
  region: string;
  status: MissionStatus;
  risk: "unknown" | "moderate" | "dangerous" | "deadly";
  scheduled_for: string | null;
  party_size: number;
  signup_count: number;
  waitlist_count: number;
  current_user_signup: "confirmed" | "waitlisted" | "withdrawn" | null;
  cover_media_id: string | null;
  estimated_duration: string | null;
  discord_thread_id: string | null;
  number: number | null;
  outcome: MissionOutcome | null;
  report: string;
  recorded_at: string | null;
  version: number;
}>;

type SignupRow = Readonly<{
  mission_id: string;
  user_id: string;
  display_name: string;
  status: "confirmed" | "waitlisted" | "withdrawn";
  created_at: string;
}>;

type MissionOwnership = Readonly<{
  campaign_id: string;
  author_user_id: string;
  status: MissionStatus;
  outcome: MissionOutcome | null;
}>;

export async function listMissions(
  campaignId: string,
  session: AuthenticatedSession | null,
  includeEditorial: boolean,
): Promise<MissionSummary[]> {
  await requireCampaignVisible(campaignId, session);
  const canEdit = Boolean(
    session &&
      hasPermission(session.principal, "mission:edit", {
        kind: "campaign",
        campaignId,
      }),
  );
  const canSeeAll = Boolean(
    session &&
      (hasPermission(session.principal, "mission:review", {
        kind: "campaign",
        campaignId,
      }) || hasElevatedMissionRole(session, campaignId)),
  );
  const userId = session?.user.id ?? "";
  const result = await getD1()
    .prepare(
      `SELECT
        m.id, m.campaign_id, m.author_user_id, u.display_name AS author_name,
        m.title, m.summary, m.region, m.status, m.risk, m.scheduled_for,
        m.party_size, m.version, m.cover_media_id, m.estimated_duration, m.discord_thread_id,
        m.number, m.outcome, m.report, m.recorded_at,
        COALESCE(SUM(CASE WHEN ms.status = 'confirmed' THEN 1 ELSE 0 END), 0) AS signup_count,
        COALESCE(SUM(CASE WHEN ms.status = 'waitlisted' THEN 1 ELSE 0 END), 0) AS waitlist_count,
        mine.status AS current_user_signup
       FROM missions m
       JOIN iam_users u ON u.id = m.author_user_id
       LEFT JOIN mission_signups ms ON ms.mission_id = m.id
       LEFT JOIN mission_signups mine ON mine.mission_id = m.id AND mine.user_id = ?
       WHERE m.campaign_id = ? AND (
         m.status = 'published'
         OR (? = 1)
         OR (? = 1 AND m.author_user_id = ?)
       )
       GROUP BY m.id
       ORDER BY
         CASE WHEN m.scheduled_for IS NULL THEN 1 ELSE 0 END,
         m.scheduled_for, m.published_at DESC, m.created_at DESC`,
    )
    .bind(
      userId,
      campaignId,
      includeEditorial && canSeeAll ? 1 : 0,
      includeEditorial && canEdit ? 1 : 0,
      userId,
    )
    .all<MissionRow>();
  return result.results.map(mapMission);
}

export async function getMission(
  missionId: string,
  session: AuthenticatedSession | null,
): Promise<MissionSummary> {
  const userId = session?.user.id ?? "";
  const row = await getD1()
    .prepare(
      `SELECT
        m.id, m.campaign_id, m.author_user_id, u.display_name AS author_name,
        m.title, m.summary, m.region, m.status, m.risk, m.scheduled_for,
        m.party_size, m.version, m.cover_media_id, m.estimated_duration, m.discord_thread_id,
        m.number, m.outcome, m.report, m.recorded_at,
        COALESCE(SUM(CASE WHEN ms.status = 'confirmed' THEN 1 ELSE 0 END), 0) AS signup_count,
        COALESCE(SUM(CASE WHEN ms.status = 'waitlisted' THEN 1 ELSE 0 END), 0) AS waitlist_count,
        mine.status AS current_user_signup
       FROM missions m
       JOIN iam_users u ON u.id = m.author_user_id
       LEFT JOIN mission_signups ms ON ms.mission_id = m.id
       LEFT JOIN mission_signups mine ON mine.mission_id = m.id AND mine.user_id = ?
       WHERE m.id = ?
       GROUP BY m.id`,
    )
    .bind(userId, missionId)
    .first<MissionRow>();
  if (!row) throw new HttpError(404, "mission_not_found", "Missão não encontrada.");
  await requireCampaignVisible(row.campaign_id, session);
  if (
    row.status !== "published" &&
    !canReadEditorial(session, row.campaign_id, row.author_user_id)
  ) {
    throw new HttpError(404, "mission_not_found", "Missão não encontrada.");
  }
  return mapMission(row);
}

export async function createMission(
  session: AuthenticatedSession,
  input: CreateMissionInput,
  correlationId: string,
): Promise<MissionSummary> {
  requirePermission(session.principal, "mission:create", {
    kind: "campaign",
    campaignId: input.campaignId,
  });
  // Missão antiga: entra publicada direto no registro, então exige publicar.
  const recorded = input.outcome !== null;
  if (recorded || input.number !== null || input.report) {
    requirePermission(session.principal, "mission:publish", {
      kind: "campaign",
      campaignId: input.campaignId,
    });
  }
  await requireActiveMembership(input.campaignId, session.user.id);
  await assertCampaignMedia(input.campaignId, input.coverMediaId ? [input.coverMediaId] : []);
  const db = getD1();
  const id = crypto.randomUUID();
  const now = recorded ? new Date().toISOString() : null;
  await withNumberConflict(() => db.batch([
    db
      .prepare(
        `INSERT INTO missions (
          id, campaign_id, author_user_id, title, summary, region, risk,
          scheduled_for, party_size, status, cover_media_id, estimated_duration,
          number, outcome, report, published_at, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.campaignId,
        session.user.id,
        input.title,
        input.summary,
        input.region,
        input.risk,
        input.scheduledFor,
        input.partySize,
        recorded ? "published" : "draft",
        input.coverMediaId,
        input.estimatedDuration || null,
        input.number,
        input.outcome,
        input.report,
        now,
        now,
      ),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: input.campaignId,
      action: "mission.created",
      entityType: "mission",
      entityId: id,
      correlationId,
      details: { title: input.title, outcome: input.outcome },
    }),
    prepareOutboxEventAfterChange(db, {
      aggregateType: "mission",
      aggregateId: id,
      eventType: "mission.created",
      payload: { missionId: id, campaignId: input.campaignId },
    }),
  ]));
  return getMission(id, session);
}

export async function updateMission(
  session: AuthenticatedSession,
  missionId: string,
  input: UpdateMissionInput,
  correlationId: string,
): Promise<MissionSummary> {
  const existing = await getMissionOwnership(missionId);
  const changesContent = [
    input.title,
    input.summary,
    input.region,
    input.risk,
    input.scheduledFor,
    input.partySize,
    input.coverMediaId,
    input.estimatedDuration,
  ].some((value) => value !== undefined);
  const changesRecord = [input.number, input.outcome, input.report].some((value) => value !== undefined);
  const isReviewOnly = input.status === "approved" || input.status === "rejected";
  const isPublishOnly = input.status === "published";
  if (changesRecord) {
    // O registro é público na hora: só quem publica missões mexe nele.
    requirePermission(session.principal, "mission:publish", {
      kind: "campaign",
      campaignId: existing.campaign_id,
    });
    if ((input.status ?? existing.status) !== "published") {
      throw new HttpError(409, "mission_not_published", "Publique a missão antes de registrá-la.");
    }
  }
  if (input.status === existing.status && !changesContent && !changesRecord) {
    if (isReviewOnly) {
      requirePermission(session.principal, "mission:review", {
        kind: "campaign",
        campaignId: existing.campaign_id,
      });
    } else if (isPublishOnly) {
      requirePermission(session.principal, "mission:publish", {
        kind: "campaign",
        campaignId: existing.campaign_id,
      });
    } else {
      assertCanEditMission(session, existing);
    }
    throw new HttpError(422, "no_effect", "A missão já está nesse estado.");
  }
  if (changesContent || (!isReviewOnly && !isPublishOnly && !changesRecord)) {
    assertCanEditMission(session, existing);
  }
  if (input.status && input.status !== existing.status) {
    assertStatusTransition(session, existing.campaign_id, existing.status, input.status);
  }
  if (input.coverMediaId) await assertCampaignMedia(existing.campaign_id, [input.coverMediaId]);
  const db = getD1();
  const publishedAt = input.status === "published" ? new Date().toISOString() : null;
  // A data do registro acompanha a última mudança no que o registro mostra.
  const touchesRecord =
    (input.outcome !== undefined && input.outcome !== existing.outcome) ||
    (changesRecord && existing.outcome !== null);
  const batch = await withNumberConflict(() => db.batch([
    db
      .prepare(
        `UPDATE missions SET
          title = COALESCE(?, title),
          summary = COALESCE(?, summary),
          region = COALESCE(?, region),
          risk = COALESCE(?, risk),
          scheduled_for = CASE WHEN ? = 1 THEN ? ELSE scheduled_for END,
          party_size = COALESCE(?, party_size),
          cover_media_id = CASE WHEN ? = 1 THEN ? ELSE cover_media_id END,
          estimated_duration = CASE WHEN ? = 1 THEN ? ELSE estimated_duration END,
          number = CASE WHEN ? = 1 THEN ? ELSE number END,
          outcome = CASE WHEN ? = 1 THEN ? ELSE outcome END,
          report = COALESCE(?, report),
          recorded_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE recorded_at END,
          status = COALESCE(?, status),
          published_at = COALESCE(?, published_at),
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(
        input.title ?? null,
        input.summary ?? null,
        input.region ?? null,
        input.risk ?? null,
        input.scheduledFor !== undefined ? 1 : 0,
        input.scheduledFor ?? null,
        input.partySize ?? null,
        input.coverMediaId !== undefined ? 1 : 0,
        input.coverMediaId ?? null,
        input.estimatedDuration !== undefined ? 1 : 0,
        input.estimatedDuration || null,
        input.number !== undefined ? 1 : 0,
        input.number ?? null,
        input.outcome !== undefined ? 1 : 0,
        input.outcome ?? null,
        input.report ?? null,
        touchesRecord ? 1 : 0,
        input.status ?? null,
        publishedAt,
        missionId,
        input.version,
      ),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: existing.campaign_id,
      action: input.status ? `mission.${input.status}` : "mission.updated",
      entityType: "mission",
      entityId: missionId,
      correlationId,
      details: { fields: Object.keys(input).filter((key) => key !== "version") },
    }),
    prepareOutboxEventAfterChange(db, {
      aggregateType: "mission",
      aggregateId: missionId,
      eventType: input.status ? `mission.${input.status}` : "mission.updated",
      payload: { missionId, campaignId: existing.campaign_id },
    }),
  ]));
  if ((batch[0]?.meta.changes ?? 0) === 0) {
    throw new HttpError(409, "version_conflict", "A missão foi alterada por outra pessoa.");
  }
  return getMission(missionId, session);
}

export async function archiveMission(
  session: AuthenticatedSession,
  missionId: string,
  version: number,
  correlationId: string,
): Promise<void> {
  const existing = await getMissionOwnership(missionId);
  assertCanEditMission(session, existing);
  const db = getD1();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE missions SET status = 'archived', version = version + 1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = ?`,
      )
      .bind(missionId, version),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: existing.campaign_id,
      action: "mission.archived",
      entityType: "mission",
      entityId: missionId,
      correlationId,
    }),
    prepareOutboxEventAfterChange(db, {
      aggregateType: "mission",
      aggregateId: missionId,
      eventType: "mission.archived",
      payload: { missionId, campaignId: existing.campaign_id },
    }),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) {
    throw new HttpError(409, "version_conflict", "A missão foi alterada por outra pessoa.");
  }
}

export async function signupForMission(
  session: AuthenticatedSession,
  missionId: string,
  correlationId: string,
): Promise<{ status: "confirmed" | "waitlisted" }> {
  const mission = await getMissionOwnership(missionId);
  if (mission.status !== "published") {
    throw new HttpError(409, "mission_not_open", "Esta missão não aceita inscrições.");
  }
  if (mission.outcome !== null) {
    throw new HttpError(409, "mission_not_open", "Esta missão já partiu e não aceita mais inscrições.");
  }
  await requireActiveMembership(mission.campaign_id, session.user.id);
  const db = getD1();
  const results = await db.batch([
    db.prepare(
      `INSERT INTO mission_signups (mission_id, user_id, status)
       VALUES (
         ?, ?,
         CASE WHEN (
           SELECT COUNT(*) FROM mission_signups
           WHERE mission_id = ? AND status = 'confirmed' AND user_id <> ?
         ) < (SELECT party_size FROM missions WHERE id = ?)
         THEN 'confirmed' ELSE 'waitlisted' END
       )
       ON CONFLICT(mission_id, user_id) DO UPDATE SET
         status = excluded.status,
         updated_at = CURRENT_TIMESTAMP
       RETURNING status`,
    ).bind(missionId, session.user.id, missionId, session.user.id, missionId),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: mission.campaign_id,
      action: "mission.signup",
      entityType: "mission",
      entityId: missionId,
      correlationId,
      details: {},
    }),
    prepareOutboxEventAfterChange(db, {
      aggregateType: "mission",
      aggregateId: missionId,
      eventType: "mission.signup",
      payload: { missionId, userId: session.user.id },
    }),
  ]);
  const result = results[0]?.results?.[0] as
    | { status: "confirmed" | "waitlisted" }
    | undefined;
  if (!result) throw new HttpError(500, "signup_failed", "A inscrição não foi concluída.");
  return result;
}

export async function withdrawFromMission(
  session: AuthenticatedSession,
  missionId: string,
  correlationId: string,
): Promise<void> {
  const mission = await getMissionOwnership(missionId);
  const db = getD1();
  const withdrawalAt = new Date().toISOString();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE mission_signups SET status = 'withdrawn', updated_at = ?
         WHERE mission_id = ? AND user_id = ? AND status <> 'withdrawn'`,
      )
      .bind(withdrawalAt, missionId, session.user.id),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId: mission.campaign_id,
      action: "mission.withdrawal",
      entityType: "mission",
      entityId: missionId,
      correlationId,
    }),
    prepareOutboxEventAfterChange(db, {
      aggregateType: "mission",
      aggregateId: missionId,
      eventType: "mission.withdrawal",
      payload: { missionId, userId: session.user.id },
    }),
    db
      .prepare(
        `UPDATE mission_signups
         SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
         WHERE mission_id = ?
           AND user_id = (
             SELECT user_id FROM mission_signups
             WHERE mission_id = ? AND status = 'waitlisted'
             ORDER BY created_at LIMIT 1
           )
           AND (
             SELECT COUNT(*) FROM mission_signups
             WHERE mission_id = ? AND status = 'confirmed'
           ) < (SELECT party_size FROM missions WHERE id = ?)
           AND EXISTS (
             SELECT 1 FROM mission_signups
             WHERE mission_id = ? AND user_id = ?
               AND status = 'withdrawn' AND updated_at = ?
           )`,
      )
      .bind(
        missionId,
        missionId,
        missionId,
        missionId,
        missionId,
        session.user.id,
        withdrawalAt,
      ),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) {
    throw new HttpError(404, "signup_not_found", "Inscrição não encontrada.");
  }
}

export async function listSignups(
  session: AuthenticatedSession,
  missionId: string,
): Promise<MissionSignup[]> {
  const mission = await getMissionOwnership(missionId);
  if (!canReadEditorial(session, mission.campaign_id, mission.author_user_id)) {
    throw new HttpError(403, "forbidden", "Você não pode visualizar esta companhia.");
  }
  const result = await getD1()
    .prepare(
      `SELECT ms.mission_id, ms.user_id, u.display_name, ms.status, ms.created_at
       FROM mission_signups ms
       JOIN iam_users u ON u.id = ms.user_id
       WHERE ms.mission_id = ? AND ms.status <> 'withdrawn'
       ORDER BY CASE ms.status WHEN 'confirmed' THEN 0 ELSE 1 END, ms.created_at`,
    )
    .bind(missionId)
    .all<SignupRow>();
  return result.results.map((row) => ({
    missionId: row.mission_id,
    userId: row.user_id,
    displayName: row.display_name,
    status: row.status,
    createdAt: toIsoDateTime(row.created_at)!,
  }));
}

async function getMissionOwnership(missionId: string): Promise<MissionOwnership> {
  const mission = await getD1()
    .prepare("SELECT campaign_id, author_user_id, status, outcome FROM missions WHERE id = ?")
    .bind(missionId)
    .first<MissionOwnership>();
  if (!mission) throw new HttpError(404, "mission_not_found", "Missão não encontrada.");
  return mission;
}

function assertCanEditMission(
  session: AuthenticatedSession,
  mission: MissionOwnership,
): void {
  requirePermission(session.principal, "mission:edit", {
    kind: "campaign",
    campaignId: mission.campaign_id,
  });
  if (mission.author_user_id === session.user.id) return;
  const elevatedRoles = new Set(["owner", "administrator", "campaign_manager", "editor"]);
  const elevated = session.assignments.some(
    (assignment) =>
      elevatedRoles.has(assignment.roleName) &&
      (assignment.scope.kind === "global" ||
        assignment.scope.campaignId === mission.campaign_id),
  );
  if (!elevated) {
    throw new HttpError(403, "own_mission_only", "Mestres editam apenas as próprias missões.");
  }
}

function assertStatusTransition(
  session: AuthenticatedSession,
  campaignId: string,
  current: MissionStatus,
  next: MissionStatus,
): void {
  const allowed: Readonly<Record<MissionStatus, readonly MissionStatus[]>> = {
    draft: ["pending_review", "archived"],
    pending_review: ["approved", "rejected", "draft", "archived"],
    approved: ["published", "rejected", "archived"],
    published: ["archived"],
    archived: ["draft"],
    rejected: ["draft", "pending_review", "archived"],
  };
  if (!allowed[current].includes(next)) {
    throw new HttpError(409, "invalid_status_transition", "Mudança de estado inválida.");
  }
  if (next === "approved" || next === "rejected") {
    requirePermission(session.principal, "mission:review", {
      kind: "campaign",
      campaignId,
    });
  }
  if (next === "published") {
    requirePermission(session.principal, "mission:publish", {
      kind: "campaign",
      campaignId,
    });
  }
}

function canReadEditorial(
  session: AuthenticatedSession | null,
  campaignId: string,
  authorUserId: string,
): boolean {
  return Boolean(
    session &&
      (session.user.id === authorUserId ||
        hasPermission(session.principal, "mission:review", {
          kind: "campaign",
          campaignId,
        }) ||
        hasElevatedMissionRole(session, campaignId)),
  );
}

function hasElevatedMissionRole(
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

async function requireActiveMembership(campaignId: string, userId: string) {
  const membership = await getD1()
    .prepare(
      `SELECT 1 AS active FROM campaign_members
       WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
    )
    .bind(campaignId, userId)
    .first<{ active: number }>();
  if (!membership) {
    throw new HttpError(403, "membership_required", "Você não é membro ativo desta campanha.");
  }
}

function mapMission(row: MissionRow): MissionSummary {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    title: row.title,
    summary: row.summary,
    region: row.region,
    status: row.status,
    risk: row.risk,
    scheduledFor: toIsoDateTime(row.scheduled_for),
    partySize: row.party_size,
    signupCount: Number(row.signup_count),
    waitlistCount: Number(row.waitlist_count),
    currentUserSignup: row.current_user_signup,
    coverMediaId: row.cover_media_id,
    estimatedDuration: row.estimated_duration,
    discordThreadId: row.discord_thread_id,
    number: row.number,
    outcome: row.outcome,
    report: row.report,
    recordedAt: toIsoDateTime(row.recorded_at),
    version: row.version,
  };
}

/** O número da missão é único na campanha; o índice do D1 garante. */
async function withNumberConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new HttpError(409, "mission_number_taken", "Já existe uma missão com esse número no registro.");
    }
    throw error;
  }
}
