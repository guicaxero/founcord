import {
  AutomationJobSchema,
  AutomationQuotaSchema,
  type AutomationGeneratedDraft,
  type AutomationJob,
  type AutomationJobCreateRequest,
  type AutomationQuota,
} from "@vigilia/contracts";
import { AutomationServiceError } from "./auth";
import type { AutomationEnv } from "./types";

const DEFAULT_DAILY_JOB_LIMIT = 3;
const LEASE_SECONDS = 180;

type AutomationJobRow = Readonly<{
  id: string;
  campaign_id: string;
  requested_by_user_id: string;
  requested_by_name: string;
  kind: AutomationJob["kind"];
  status: AutomationJob["status"];
  source_kind: AutomationJob["sourceKind"];
  source_label: string | null;
  source_content: string;
  suggested_title: string | null;
  instructions: string | null;
  idempotency_key: string;
  correlation_id: string;
  post_id: string | null;
  result_title: string | null;
  result_body: string | null;
  model: string | null;
  attempts: number;
  max_attempts: number;
  lease_token: string | null;
  lease_expires_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}>;

export type ClaimedAutomationJob = Readonly<{
  row: AutomationJobRow;
  leaseToken: string;
}>;

export async function createAutomationJob(
  env: AutomationEnv,
  input: AutomationJobCreateRequest,
  idempotencyKey: string,
): Promise<Readonly<{ job: AutomationJob; duplicate: boolean; quota: AutomationQuota }>> {
  const existing = await findByIdempotencyKey(env, idempotencyKey);
  if (existing) {
    return { job: mapJob(existing), duplicate: true, quota: await getAutomationQuota(env) };
  }

  const quota = await reserveDailyJob(env, input.source.content.length);
  const id = crypto.randomUUID();
  try {
    await env.AUTOMATION_DB.prepare(
      `INSERT INTO automation_jobs (
        id, campaign_id, requested_by_user_id, requested_by_name, kind, status,
        source_kind, source_label, source_content, suggested_title, instructions,
        idempotency_key, correlation_id
      ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        input.campaignId,
        input.requestedByUserId,
        input.requestedByName,
        input.kind,
        input.source.kind,
        input.source.label ?? null,
        input.source.content,
        input.suggestedTitle ?? null,
        input.instructions ?? null,
        idempotencyKey,
        input.correlationId,
      )
      .run();
  } catch (error) {
    const duplicate = await findByIdempotencyKey(env, idempotencyKey);
    if (duplicate) {
      return { job: mapJob(duplicate), duplicate: true, quota: await getAutomationQuota(env) };
    }
    throw error;
  }
  return { job: mapJob(await requireJobRow(env, id)), duplicate: false, quota };
}

export async function listAutomationJobs(
  env: AutomationEnv,
  campaignId: string,
): Promise<Readonly<{ data: AutomationJob[]; quota: AutomationQuota }>> {
  const result = await env.AUTOMATION_DB.prepare(
    `SELECT * FROM automation_jobs
     WHERE campaign_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
  )
    .bind(campaignId)
    .all<AutomationJobRow>();
  return {
    data: result.results.map(mapJob),
    quota: await getAutomationQuota(env),
  };
}

export async function getAutomationJob(
  env: AutomationEnv,
  campaignId: string,
  jobId: string,
): Promise<AutomationJob> {
  const row = await env.AUTOMATION_DB.prepare(
    "SELECT * FROM automation_jobs WHERE id = ? AND campaign_id = ?",
  )
    .bind(jobId, campaignId)
    .first<AutomationJobRow>();
  if (!row) {
    throw new AutomationServiceError(404, "automation_job_not_found", "Automação não encontrada.");
  }
  return mapJob(row);
}

export async function claimAutomationJob(
  env: AutomationEnv,
  jobId: string,
): Promise<ClaimedAutomationJob | null> {
  const leaseToken = crypto.randomUUID();
  const result = await env.AUTOMATION_DB.prepare(
    `UPDATE automation_jobs
     SET status = 'processing', lease_token = ?,
         lease_expires_at = datetime('now', ?), attempts = attempts + 1,
         started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
         error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND attempts < max_attempts AND (
       status = 'queued'
       OR (status = 'processing' AND datetime(lease_expires_at) <= CURRENT_TIMESTAMP)
     )`,
  )
    .bind(leaseToken, `+${LEASE_SECONDS} seconds`, jobId)
    .run();
  if ((result.meta.changes ?? 0) === 0) return null;
  const row = await requireJobRow(env, jobId);
  return { row, leaseToken };
}

export async function completeAutomationJob(
  env: AutomationEnv,
  jobId: string,
  leaseToken: string,
  generated: AutomationGeneratedDraft,
  postId: string,
  model: string,
): Promise<boolean> {
  const result = await env.AUTOMATION_DB.prepare(
    `UPDATE automation_jobs
     SET status = 'awaiting_review', post_id = ?, result_title = ?, result_body = ?,
         model = ?, lease_token = NULL, lease_expires_at = NULL,
         error_code = NULL, error_message = NULL,
         completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'processing' AND lease_token = ?`,
  )
    .bind(postId, generated.title, generated.body, model, jobId, leaseToken)
    .run();
  if ((result.meta.changes ?? 0) === 0) return false;
  await env.AUTOMATION_DB.prepare(
    `UPDATE automation_daily_usage
     SET jobs_completed = jobs_completed + 1,
         output_characters = output_characters + ?, updated_at = CURRENT_TIMESTAMP
     WHERE day = ?`,
  )
    .bind(generated.body.length + generated.title.length, utcDay())
    .run();
  return true;
}

export async function failAutomationJob(
  env: AutomationEnv,
  jobId: string,
  leaseToken: string,
  error: unknown,
): Promise<"retry" | "failed" | "ignored"> {
  const current = await env.AUTOMATION_DB.prepare(
    "SELECT * FROM automation_jobs WHERE id = ? AND lease_token = ?",
  )
    .bind(jobId, leaseToken)
    .first<AutomationJobRow>();
  if (!current || current.status !== "processing") return "ignored";
  const retry = current.attempts < current.max_attempts;
  await env.AUTOMATION_DB.prepare(
    `UPDATE automation_jobs
     SET status = ?, lease_token = NULL, lease_expires_at = NULL,
         error_code = 'generation_failed', error_message = ?,
         completed_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'processing' AND lease_token = ?`,
  )
    .bind(
      retry ? "queued" : "failed",
      safeErrorMessage(error),
      retry ? null : new Date().toISOString(),
      jobId,
      leaseToken,
    )
    .run();
  return retry ? "retry" : "failed";
}

export async function retryAutomationJob(
  env: AutomationEnv,
  campaignId: string,
  jobId: string,
): Promise<AutomationJob> {
  const current = await getAutomationJob(env, campaignId, jobId);
  if (current.status !== "failed") {
    throw new AutomationServiceError(
      409,
      "automation_job_not_retryable",
      "Somente automações com falha podem ser tentadas novamente.",
    );
  }
  await reserveDailyJob(env, 0);
  const result = await env.AUTOMATION_DB.prepare(
    `UPDATE automation_jobs
     SET status = 'queued', attempts = 0, error_code = NULL, error_message = NULL,
         completed_at = NULL, lease_token = NULL, lease_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND campaign_id = ? AND status = 'failed'`,
  )
    .bind(jobId, campaignId)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new AutomationServiceError(
      409,
      "automation_job_not_retryable",
      "A automação não pôde ser reenfileirada.",
    );
  }
  return getAutomationJob(env, campaignId, jobId);
}

export async function cancelAutomationJob(
  env: AutomationEnv,
  campaignId: string,
  jobId: string,
): Promise<void> {
  const result = await env.AUTOMATION_DB.prepare(
    `UPDATE automation_jobs
     SET status = 'cancelled', source_content = '', lease_token = NULL,
         lease_expires_at = NULL, completed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND campaign_id = ? AND status IN ('queued', 'failed')`,
  )
    .bind(jobId, campaignId)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    const current = await getAutomationJob(env, campaignId, jobId);
    throw new AutomationServiceError(
      409,
      "automation_job_not_cancellable",
      current.status === "cancelled"
        ? "A automação já foi cancelada."
        : current.status === "processing"
          ? "A geração já começou e não pode ser interrompida com segurança."
          : "Esta automação já gerou um rascunho e não pode ser cancelada.",
    );
  }
}

export async function purgeAutomationSources(env: AutomationEnv): Promise<number> {
  const result = await env.AUTOMATION_DB.prepare(
    `UPDATE automation_jobs SET source_content = '', instructions = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE source_content <> '' AND status IN ('awaiting_review', 'failed', 'cancelled')
       AND datetime(completed_at) < datetime('now', '-30 days')`,
  ).run();
  return result.meta.changes ?? 0;
}

export async function recoverAndListDispatchableJobs(
  env: AutomationEnv,
): Promise<ReadonlyArray<Readonly<{ jobId: string; correlationId: string }>>> {
  await env.AUTOMATION_DB.prepare(
    `UPDATE automation_jobs
     SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
         error_code = 'attempts_exhausted',
         error_message = 'O processamento foi interrompido após esgotar as tentativas.',
         completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE status = 'processing' AND datetime(lease_expires_at) <= CURRENT_TIMESTAMP
       AND attempts >= max_attempts`,
  ).run();
  const result = await env.AUTOMATION_DB.prepare(
    `SELECT id, correlation_id
     FROM automation_jobs
     WHERE status = 'queued'
       OR (status = 'processing' AND datetime(lease_expires_at) <= CURRENT_TIMESTAMP
           AND attempts < max_attempts)
     ORDER BY created_at ASC
     LIMIT 25`,
  ).all<{ id: string; correlation_id: string }>();
  return result.results.map((row) => ({
    jobId: row.id,
    correlationId: row.correlation_id,
  }));
}

async function reserveDailyJob(
  env: AutomationEnv,
  inputCharacters: number,
): Promise<AutomationQuota> {
  const day = utcDay();
  const limit = dailyJobLimit(env);
  await env.AUTOMATION_DB.prepare(
    `INSERT OR IGNORE INTO automation_daily_usage (day) VALUES (?)`,
  )
    .bind(day)
    .run();
  const result = await env.AUTOMATION_DB.prepare(
    `UPDATE automation_daily_usage
     SET jobs_created = jobs_created + 1,
         input_characters = input_characters + ?, updated_at = CURRENT_TIMESTAMP
     WHERE day = ? AND jobs_created < ?`,
  )
    .bind(inputCharacters, day, limit)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new AutomationServiceError(
      429,
      "automation_daily_limit_reached",
      "O limite gratuito de automações de hoje foi atingido. Tente novamente amanhã.",
    );
  }
  return getAutomationQuota(env);
}

export async function getAutomationQuota(env: AutomationEnv): Promise<AutomationQuota> {
  const day = utcDay();
  const row = await env.AUTOMATION_DB.prepare(
    "SELECT jobs_created FROM automation_daily_usage WHERE day = ?",
  )
    .bind(day)
    .first<{ jobs_created: number }>();
  const dailyJobLimitValue = dailyJobLimit(env);
  const usedToday = Math.max(0, row?.jobs_created ?? 0);
  return AutomationQuotaSchema.parse({
    day,
    dailyJobLimit: dailyJobLimitValue,
    usedToday,
    remainingToday: Math.max(0, dailyJobLimitValue - usedToday),
  });
}

async function findByIdempotencyKey(
  env: AutomationEnv,
  idempotencyKey: string,
): Promise<AutomationJobRow | null> {
  return env.AUTOMATION_DB.prepare(
    "SELECT * FROM automation_jobs WHERE idempotency_key = ?",
  )
    .bind(idempotencyKey)
    .first<AutomationJobRow>();
}

async function requireJobRow(env: AutomationEnv, id: string): Promise<AutomationJobRow> {
  const row = await env.AUTOMATION_DB.prepare("SELECT * FROM automation_jobs WHERE id = ?")
    .bind(id)
    .first<AutomationJobRow>();
  if (!row) throw new Error("Automation job disappeared after persistence.");
  return row;
}

export function mapJob(row: AutomationJobRow): AutomationJob {
  const preview = row.source_content.replace(/\s+/gu, " ").trim().slice(0, 240);
  return AutomationJobSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    requestedByUserId: row.requested_by_user_id,
    requestedByName: row.requested_by_name,
    kind: row.kind,
    status: row.status,
    sourceKind: row.source_kind,
    sourceLabel: row.source_label,
    sourcePreview: preview,
    suggestedTitle: row.suggested_title,
    postId: row.post_id,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    model: row.model,
    errorMessage: row.error_message,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    startedAt: row.started_at ? toIso(row.started_at) : null,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
  });
}

function dailyJobLimit(env: AutomationEnv): number {
  const parsed = Number(env.AUTOMATION_DAILY_JOB_LIMIT ?? DEFAULT_DAILY_JOB_LIMIT);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 25
    ? parsed
    : DEFAULT_DAILY_JOB_LIMIT;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function toIso(value: string): string {
  return value.includes("T")
    ? new Date(value).toISOString()
    : new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha desconhecida.";
  return message.replace(/[\r\n]+/gu, " ").slice(0, 500);
}
