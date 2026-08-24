import { hasPermission, requirePermission } from "@vigilia/authz";
import {
  CampaignSessionGenerationResponseSchema,
  CampaignSessionOptionsSchema,
  CampaignSessionSchema,
  type CampaignSession,
  type CampaignSessionCaptureStatus,
  type CampaignSessionGenerationResponse,
  type CampaignSessionOptions,
  type CampaignSessionStatus,
  type CreateCampaignSessionInput,
  type FoundryCaptureSession,
  type GenerateCampaignSessionDraftInput,
  type UpdateCampaignSessionInput,
} from "@vigilia/contracts";
import { getD1 } from "@/db";
import { prepareAudit, prepareAuditAfterChange } from "@/server/audit";
import type { AuthenticatedSession } from "@/server/auth/session";
import {
  listCampaignAutomations,
  requestCampaignAutomation,
} from "@/server/automations/jobs";
import {
  endFoundryCapture,
  getFoundryCaptureTranscript,
  getFoundryWorlds,
  listFoundryCaptureStates,
  startFoundryCapture,
} from "@/server/integrations/foundry-worlds";
import { HttpError } from "@/server/http";
import { toIsoDateTime } from "@/server/time";

type CampaignSessionRow = Readonly<{
  id: string;
  campaign_id: string;
  mission_id: string | null;
  mission_title: string | null;
  master_user_id: string;
  master_name: string;
  title: string;
  status: CampaignSessionStatus;
  world_id: string | null;
  world_title: string | null;
  discord_reference: string | null;
  notes: string;
  captured_message_count: number;
  last_captured_at: string | null;
  transcript_truncated: number;
  automation_job_id: string | null;
  post_id: string | null;
  capture_error: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}>;

type SessionOwnership = Readonly<{
  id: string;
  campaign_id: string;
  world_id: string | null;
  world_title: string | null;
  mission_id: string | null;
  mission_title: string | null;
  title: string;
  status: CampaignSessionStatus;
  notes: string;
  discord_reference: string | null;
  automation_job_id: string | null;
  started_at: string | null;
  version: number;
}>;

export async function listCampaignSessions(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<CampaignSession[]> {
  requirePermission(session.principal, "session:read", {
    kind: "campaign",
    campaignId,
  });
  await assertCampaignAvailable(campaignId, false);
  const rows = await getD1()
    .prepare(
      `SELECT cs.id, cs.campaign_id, cs.mission_id, m.title AS mission_title,
              cs.master_user_id, u.display_name AS master_name, cs.title,
              cs.status, cs.world_id, cs.world_title, cs.discord_reference,
              cs.notes, cs.captured_message_count, cs.last_captured_at,
              cs.transcript_truncated, cs.automation_job_id,
              adl.post_id, cs.capture_error, cs.started_at, cs.ended_at,
              cs.created_at, cs.updated_at, cs.version
       FROM campaign_sessions cs
       INNER JOIN iam_users u ON u.id = cs.master_user_id
       LEFT JOIN missions m ON m.id = cs.mission_id
       LEFT JOIN automation_draft_links adl ON adl.job_id = cs.automation_job_id
       WHERE cs.campaign_id = ?
       ORDER BY
         CASE cs.status
           WHEN 'active' THEN 0 WHEN 'starting' THEN 1 WHEN 'prepared' THEN 2
           ELSE 3
         END,
         datetime(cs.created_at) DESC`,
    )
    .bind(campaignId)
    .all<CampaignSessionRow>();

  let captures = new Map<string, FoundryCaptureSession>();
  let captureServiceAvailable = true;
  if (rows.results.some((row) => row.world_id)) {
    try {
      captures = new Map(
        (await listFoundryCaptureStates(campaignId, correlationId)).map((capture) => [
          capture.sessionId,
          capture,
        ]),
      );
    } catch {
      captureServiceAvailable = false;
    }
  }
  return rows.results.map((row) =>
    mapCampaignSession(row, captures.get(row.id), captureServiceAvailable),
  );
}

export async function getCampaignSession(
  session: AuthenticatedSession,
  campaignId: string,
  sessionId: string,
  correlationId: string,
): Promise<CampaignSession> {
  const found = (await listCampaignSessions(session, campaignId, correlationId)).find(
    (candidate) => candidate.id === sessionId,
  );
  if (!found) throw sessionNotFound();
  return found;
}

export async function getCampaignSessionOptions(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<CampaignSessionOptions> {
  requirePermission(session.principal, "session:manage", {
    kind: "campaign",
    campaignId,
  });
  await assertCampaignAvailable(campaignId, true);
  const missions = await getD1()
    .prepare(
      `SELECT id, title FROM missions
       WHERE campaign_id = ? AND status <> 'archived'
       ORDER BY title COLLATE NOCASE`,
    )
    .bind(campaignId)
    .all<{ id: string; title: string }>();
  const canManageFoundry = hasPermission(session.principal, "foundry:world:manage", {
    kind: "campaign",
    campaignId,
  });
  let foundryAvailable = true;
  let worlds: CampaignSessionOptions["worlds"] = [];
  if (canManageFoundry) {
    try {
      worlds = (await getFoundryWorlds(session, campaignId, correlationId)).data.map(
        (world) => ({
          worldId: world.worldId,
          worldTitle: world.worldTitle,
          status: world.status,
        }),
      );
    } catch {
      foundryAvailable = false;
    }
  }
  return CampaignSessionOptionsSchema.parse({
    missions: missions.results,
    worlds,
    foundryAvailable,
  });
}

export async function createCampaignSession(
  session: AuthenticatedSession,
  input: CreateCampaignSessionInput,
  correlationId: string,
): Promise<CampaignSession> {
  requirePermission(session.principal, "session:manage", {
    kind: "campaign",
    campaignId: input.campaignId,
  });
  await assertCampaignAvailable(input.campaignId, true);
  await assertMissionScope(input.campaignId, input.missionId);

  let worldTitle: string | null = null;
  if (input.worldId) {
    requirePermission(session.principal, "foundry:world:manage", {
      kind: "campaign",
      campaignId: input.campaignId,
    });
    const world = (await getFoundryWorlds(session, input.campaignId, correlationId)).data.find(
      (candidate) => candidate.worldId === input.worldId,
    );
    if (!world || world.status === "revoked") {
      throw new HttpError(422, "world_unavailable", "Escolha um mundo conectado à campanha.");
    }
    worldTitle = world.worldTitle;
  }

  const id = crypto.randomUUID();
  const startedAt = input.startNow ? new Date().toISOString() : null;
  const initialStatus: CampaignSessionStatus = input.startNow
    ? input.worldId
      ? "starting"
      : "active"
    : "prepared";
  const db = getD1();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaign_sessions (
            id, campaign_id, mission_id, master_user_id, title, status,
            world_id, world_title, discord_reference, notes, started_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.campaignId,
          input.missionId,
          session.user.id,
          input.title,
          initialStatus,
          input.worldId,
          worldTitle,
          input.discordReference,
          input.notes,
          startedAt,
        ),
      prepareAudit(db, {
        actorUserId: session.user.id,
        campaignId: input.campaignId,
        action: input.startNow ? "campaign_session.registered_and_started" : "campaign_session.registered",
        entityType: "campaign_session",
        entityId: id,
        correlationId,
        details: { missionId: input.missionId, worldId: input.worldId },
      }),
    ]);
  } catch (error) {
    const message = String(error).toLowerCase();
    if (message.includes("uq_campaign_sessions_active_world") || message.includes("campaign_sessions.world_id")) {
      throw new HttpError(
        409,
        "world_capture_active",
        "Este mundo já está registrando outra sessão.",
      );
    }
    throw error;
  }

  if (input.startNow && input.worldId && startedAt) {
    await activateFoundryCapture(
      session,
      {
        id,
        campaignId: input.campaignId,
        worldId: input.worldId,
        startedAt,
      },
      correlationId,
    );
  }
  return getCampaignSession(session, input.campaignId, id, correlationId);
}

export async function updateCampaignSession(
  session: AuthenticatedSession,
  campaignId: string,
  sessionId: string,
  input: UpdateCampaignSessionInput,
  correlationId: string,
): Promise<CampaignSession> {
  requirePermission(session.principal, "session:manage", {
    kind: "campaign",
    campaignId,
  });
  await assertCampaignAvailable(campaignId, true);
  const existing = await getSessionOwnership(sessionId, campaignId);
  if (existing.status === "cancelled") {
    throw new HttpError(409, "session_cancelled", "A sessão foi cancelada.");
  }
  await assertMissionScope(campaignId, input.missionId);
  const db = getD1();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE campaign_sessions SET
          title = COALESCE(?, title),
          mission_id = CASE WHEN ? = 1 THEN ? ELSE mission_id END,
          discord_reference = CASE WHEN ? = 1 THEN ? ELSE discord_reference END,
          notes = COALESCE(?, notes),
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND campaign_id = ? AND version = ?`,
      )
      .bind(
        input.title ?? null,
        input.missionId !== undefined ? 1 : 0,
        input.missionId ?? null,
        input.discordReference !== undefined ? 1 : 0,
        input.discordReference ?? null,
        input.notes ?? null,
        sessionId,
        campaignId,
        input.version,
      ),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "campaign_session.updated",
      entityType: "campaign_session",
      entityId: sessionId,
      correlationId,
      details: { fields: Object.keys(input).filter((key) => key !== "version") },
    }),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) throw versionConflict();
  return getCampaignSession(session, campaignId, sessionId, correlationId);
}

export async function startCampaignSession(
  session: AuthenticatedSession,
  campaignId: string,
  sessionId: string,
  version: number,
  correlationId: string,
): Promise<CampaignSession> {
  requirePermission(session.principal, "session:manage", {
    kind: "campaign",
    campaignId,
  });
  await assertCampaignAvailable(campaignId, true);
  const existing = await getSessionOwnership(sessionId, campaignId);
  if (!['prepared', 'capture_failed'].includes(existing.status)) {
    throw new HttpError(409, "session_not_startable", "Esta sessão não pode ser iniciada.");
  }
  if (existing.world_id) {
    requirePermission(session.principal, "foundry:world:manage", {
      kind: "campaign",
      campaignId,
    });
  }
  const startedAt = new Date().toISOString();
  const nextStatus = existing.world_id ? "starting" : "active";
  let result: D1Result;
  try {
    result = await getD1()
      .prepare(
        `UPDATE campaign_sessions SET status = ?, started_at = ?, ended_at = NULL,
                capture_error = NULL, version = version + 1,
                updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND campaign_id = ? AND version = ?
           AND status IN ('prepared', 'capture_failed')`,
      )
      .bind(nextStatus, startedAt, sessionId, campaignId, version)
      .run();
  } catch (error) {
    const message = String(error).toLowerCase();
    if (message.includes("campaign_sessions.world_id") || message.includes("active_world")) {
      throw new HttpError(
        409,
        "world_capture_active",
        "Este mundo já está registrando outra sessão.",
      );
    }
    throw error;
  }
  if ((result.meta.changes ?? 0) === 0) throw versionConflict();
  if (existing.world_id) {
    await activateFoundryCapture(
      session,
      { id: sessionId, campaignId, worldId: existing.world_id, startedAt },
      correlationId,
    );
  }
  await prepareAudit(getD1(), {
    actorUserId: session.user.id,
    campaignId,
    action: "campaign_session.started",
    entityType: "campaign_session",
    entityId: sessionId,
    correlationId,
  }).run();
  return getCampaignSession(session, campaignId, sessionId, correlationId);
}

export async function endCampaignSession(
  session: AuthenticatedSession,
  campaignId: string,
  sessionId: string,
  version: number,
  correlationId: string,
): Promise<CampaignSession> {
  requirePermission(session.principal, "session:manage", {
    kind: "campaign",
    campaignId,
  });
  const existing = await getSessionOwnership(sessionId, campaignId);
  if (!['active', 'starting', 'capture_failed'].includes(existing.status)) {
    if (existing.status === "ended") {
      return getCampaignSession(session, campaignId, sessionId, correlationId);
    }
    throw new HttpError(409, "session_not_active", "Esta sessão não está em andamento.");
  }

  let messageCount = 0;
  let lastMessageAt: string | null = null;
  if (existing.world_id && existing.status !== "capture_failed") {
    const capture = await endFoundryCapture(
      campaignId,
      existing.world_id,
      sessionId,
      correlationId,
    );
    messageCount = capture.messageCount;
    lastMessageAt = capture.lastMessageAt;
  }
  const db = getD1();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE campaign_sessions
         SET status = 'ended', ended_at = CURRENT_TIMESTAMP,
             captured_message_count = ?, last_captured_at = ?,
             capture_error = NULL, version = version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND campaign_id = ? AND version = ?
           AND status IN ('active', 'starting', 'capture_failed')`,
      )
      .bind(messageCount, lastMessageAt, sessionId, campaignId, version),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "campaign_session.ended",
      entityType: "campaign_session",
      entityId: sessionId,
      correlationId,
      details: { messageCount },
    }),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) throw versionConflict();
  return getCampaignSession(session, campaignId, sessionId, correlationId);
}

export async function generateCampaignSessionDraft(
  session: AuthenticatedSession,
  campaignId: string,
  sessionId: string,
  input: GenerateCampaignSessionDraftInput,
  correlationId: string,
): Promise<CampaignSessionGenerationResponse> {
  requirePermission(session.principal, "session:manage", {
    kind: "campaign",
    campaignId,
  });
  const existing = await getSessionOwnership(sessionId, campaignId);
  if (existing.status !== "ended") {
    throw new HttpError(
      409,
      "session_not_ended",
      "Encerre a sessão e revise as fontes antes de gerar um rascunho.",
    );
  }
  if (existing.automation_job_id) {
    const previous = (
      await listCampaignAutomations(session, campaignId, correlationId)
    ).data.find((job) => job.id === existing.automation_job_id);
    if (!previous || previous.status !== "cancelled") {
      throw new HttpError(
        409,
        "session_draft_already_requested",
        "Esta sessão já possui um rascunho solicitado.",
      );
    }
  }

  let foundryTranscript = "";
  let transcriptTruncated = false;
  let foundryMessageCount = 0;
  if (existing.world_id) {
    const transcript = await getFoundryCaptureTranscript(
      campaignId,
      existing.world_id,
      sessionId,
      correlationId,
    );
    foundryTranscript = transcript.transcript.trim();
    transcriptTruncated = transcript.truncated;
    foundryMessageCount = transcript.messageCount;
  }
  const notesTruncated = existing.notes.trim().length > 10_000;
  const sourceParts = [
    `Sessão: ${existing.title}`,
    existing.mission_title ? `Missão relacionada: ${existing.mission_title}` : null,
    existing.notes.trim()
      ? `NOTAS DO MESTRE\n${existing.notes.trim().slice(0, 10_000)}`
      : null,
    foundryTranscript ? `REGISTRO PÚBLICO DO FOUNDRY\n${foundryTranscript}` : null,
  ].filter((part): part is string => Boolean(part));
  const rawContent = sourceParts.join("\n\n");
  const sourceWasTruncated = notesTruncated || rawContent.length > 40_000;
  const truncationNotice = "\n\n[Material truncado pelo limite de processamento.]";
  const content = sourceWasTruncated
    ? `${rawContent.slice(0, 40_000 - truncationNotice.length)}${truncationNotice}`
    : rawContent;
  if (content.length < 100 || (!foundryTranscript && !existing.notes.trim())) {
    throw new HttpError(
      422,
      "session_source_too_short",
      "Ainda não há material suficiente. Adicione notas ou capture registros do Foundry.",
    );
  }

  transcriptTruncated ||= sourceWasTruncated;
  const automation = await requestCampaignAutomation(
    session,
    {
      campaignId,
      kind: input.kind,
      source: {
        kind: foundryTranscript ? "foundry_chat" : "pasted_text",
        label: `Sessão: ${existing.title}`,
        content,
      },
      ...(input.suggestedTitle ? { suggestedTitle: input.suggestedTitle } : {}),
      ...(input.instructions ? { instructions: input.instructions } : {}),
    },
    `session:${sessionId}:draft:v${existing.version}`,
    correlationId,
  );
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE campaign_sessions
         SET automation_job_id = ?, transcript_truncated = ?,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND campaign_id = ?
           AND (automation_job_id IS NULL OR automation_job_id = ?)`,
      )
      .bind(
        automation.job.id,
        transcriptTruncated ? 1 : 0,
        sessionId,
        campaignId,
        existing.automation_job_id,
      ),
    prepareAuditAfterChange(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "campaign_session.draft_requested",
      entityType: "campaign_session",
      entityId: sessionId,
      correlationId,
      details: {
        jobId: automation.job.id,
        foundryMessageCount,
        notesIncluded: Boolean(existing.notes.trim()),
        discordImported: false,
        transcriptTruncated,
      },
    }),
  ]);
  return CampaignSessionGenerationResponseSchema.parse({
    session: await getCampaignSession(session, campaignId, sessionId, correlationId),
    automation,
  });
}

async function activateFoundryCapture(
  session: AuthenticatedSession,
  input: Readonly<{
    id: string;
    campaignId: string;
    worldId: string;
    startedAt: string;
  }>,
  correlationId: string,
): Promise<void> {
  try {
    await startFoundryCapture(
      {
        sessionId: input.id,
        campaignId: input.campaignId,
        worldId: input.worldId,
        startedAt: input.startedAt,
      },
      correlationId,
    );
    await getD1()
      .prepare(
        `UPDATE campaign_sessions
         SET status = 'active', capture_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND campaign_id = ? AND status = 'starting'`,
      )
      .bind(input.id, input.campaignId)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Falha na captura.";
    await getD1()
      .prepare(
        `UPDATE campaign_sessions
         SET status = 'capture_failed', capture_error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND campaign_id = ? AND status = 'starting'`,
      )
      .bind(message, input.id, input.campaignId)
      .run();
    await prepareAudit(getD1(), {
      actorUserId: session.user.id,
      campaignId: input.campaignId,
      action: "campaign_session.capture_failed",
      entityType: "campaign_session",
      entityId: input.id,
      correlationId,
      details: { worldId: input.worldId },
    }).run();
    throw error;
  }
}

async function getSessionOwnership(
  sessionId: string,
  campaignId: string,
): Promise<SessionOwnership> {
  const row = await getD1()
    .prepare(
      `SELECT cs.id, cs.campaign_id, cs.world_id, cs.world_title,
              cs.mission_id, m.title AS mission_title, cs.title, cs.status,
              cs.notes, cs.discord_reference, cs.automation_job_id,
              cs.started_at, cs.version
       FROM campaign_sessions cs
       LEFT JOIN missions m ON m.id = cs.mission_id
       WHERE cs.id = ? AND cs.campaign_id = ?`,
    )
    .bind(sessionId, campaignId)
    .first<SessionOwnership>();
  if (!row) throw sessionNotFound();
  return row;
}

async function assertCampaignAvailable(campaignId: string, rejectArchived: boolean) {
  const campaign = await getD1()
    .prepare("SELECT status FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<{ status: "draft" | "active" | "archived" }>();
  if (!campaign) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
  if (rejectArchived && campaign.status === "archived") {
    throw new HttpError(409, "campaign_archived", "Reative a campanha para registrar sessões.");
  }
}

async function assertMissionScope(campaignId: string, missionId: string | null | undefined) {
  if (missionId === undefined || missionId === null) return;
  const mission = await getD1()
    .prepare("SELECT 1 AS found FROM missions WHERE id = ? AND campaign_id = ?")
    .bind(missionId, campaignId)
    .first<{ found: number }>();
  if (!mission) {
    throw new HttpError(422, "mission_scope_mismatch", "A missão não pertence à campanha.");
  }
}

function mapCampaignSession(
  row: CampaignSessionRow,
  capture: FoundryCaptureSession | undefined,
  captureServiceAvailable: boolean,
): CampaignSession {
  const worldStatus = capture?.worldStatus ?? "offline";
  const messageCount = capture?.messageCount ?? Number(row.captured_message_count);
  const captureStatus = deriveCaptureStatus(row, capture, captureServiceAvailable, messageCount);
  return CampaignSessionSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    status: row.status,
    mission:
      row.mission_id && row.mission_title
        ? { id: row.mission_id, title: row.mission_title }
        : null,
    master: { id: row.master_user_id, name: row.master_name },
    foundry:
      row.world_id && row.world_title
        ? {
            worldId: row.world_id,
            worldTitle: capture?.worldTitle ?? row.world_title,
            worldStatus,
            captureStatus,
            messageCount,
            lastMessageAt: capture?.lastMessageAt ?? toIsoDateTime(row.last_captured_at),
            transcriptTruncated: Boolean(row.transcript_truncated),
            errorMessage: row.capture_error,
          }
        : null,
    discordReference: row.discord_reference,
    discordImported: false,
    notes: row.notes,
    automationJobId: row.automation_job_id,
    postId: row.post_id,
    startedAt: toIsoDateTime(row.started_at),
    endedAt: toIsoDateTime(row.ended_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
    version: row.version,
  });
}

function deriveCaptureStatus(
  row: CampaignSessionRow,
  capture: FoundryCaptureSession | undefined,
  captureServiceAvailable: boolean,
  messageCount: number,
): CampaignSessionCaptureStatus {
  if (!row.world_id) return "not_configured";
  if (row.status === "capture_failed") return "failed";
  if (row.status === "starting") return "starting";
  if (row.status === "cancelled" || capture?.status === "cancelled") return "cancelled";
  if (row.status === "ended" || capture?.status === "ended") return "ended";
  if (!captureServiceAvailable || capture?.worldStatus === "revoked") return "interrupted";
  if (!capture || capture.worldStatus === "offline") {
    return messageCount > 0 ? "interrupted" : "waiting";
  }
  return messageCount > 0 ? "capturing" : "waiting";
}

function sessionNotFound() {
  return new HttpError(404, "campaign_session_not_found", "Sessão não encontrada.");
}

function versionConflict() {
  return new HttpError(409, "version_conflict", "A sessão foi alterada por outra pessoa.");
}
