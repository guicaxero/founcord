import { Hono } from "hono";
import {
  AutomationJobCreateRequestSchema,
  AutomationJobCreateResponseSchema,
  AutomationJobListResponseSchema,
  AutomationQueueMessageSchema,
  EntityIdSchema,
  RetryAutomationJobSchema,
  type AutomationQueueMessage,
} from "@ordem/contracts";
import type { ZodType } from "zod";
import { assertAutomationServiceRequest, AutomationServiceError } from "./auth";
import { generateAutomationDraft } from "./generator";
import { createPortalAutomationDraft } from "./portal-client";
import {
  cancelAutomationJob,
  claimAutomationJob,
  completeAutomationJob,
  createAutomationJob,
  failAutomationJob,
  getAutomationJob,
  listAutomationJobs,
  purgeAutomationSources,
  recoverAndListDispatchableJobs,
  retryAutomationJob,
} from "./repository";
import type { AutomationBatch, AutomationEnv } from "./types";

type Variables = Readonly<{ correlationId: string }>;
const automationApp = new Hono<{ Bindings: AutomationEnv; Variables: Variables }>();

automationApp.use("*", async (context, next) => {
  const supplied = context.req.header("x-correlation-id");
  context.set(
    "correlationId",
    supplied && EntityIdSchema.safeParse(supplied).success ? supplied : crypto.randomUUID(),
  );
  await next();
  context.header("x-correlation-id", context.get("correlationId"));
  context.header("cache-control", "no-store");
});

automationApp.get("/health", async (context) => {
  const row = await context.env.AUTOMATION_DB.prepare("SELECT 1 AS healthy").first<{
    healthy: number;
  }>();
  return context.json({
    service: "automation",
    status: row?.healthy === 1 ? "ok" : "degraded",
  });
});

automationApp.use("/internal/*", async (context, next) => {
  await assertAutomationServiceRequest(
    context.req.raw,
    context.env.AUTOMATION_SERVICE_TOKEN,
  );
  await next();
});

automationApp.get("/internal/automations/campaigns/:campaignId/jobs", async (context) => {
  const campaignId = parseId(context.req.param("campaignId"));
  return context.json(
    AutomationJobListResponseSchema.parse(
      await listAutomationJobs(context.env, campaignId),
    ),
  );
});

automationApp.post("/internal/automations/campaigns/:campaignId/jobs", async (context) => {
  const campaignId = parseId(context.req.param("campaignId"));
  const idempotencyKey = parseIdempotencyKey(context.req.header("idempotency-key"));
  const input = await parseJson(context.req.raw, AutomationJobCreateRequestSchema);
  if (input.campaignId !== campaignId) {
    throw new AutomationServiceError(422, "campaign_mismatch", "A campanha informada é inválida.");
  }
  const result = await createAutomationJob(context.env, input, idempotencyKey);
  if (result.job.status === "queued") {
    await enqueueSafely(context.env, {
      jobId: result.job.id,
      correlationId: input.correlationId,
    });
  }
  return context.json(
    AutomationJobCreateResponseSchema.parse(result),
    result.duplicate ? 200 : 201,
  );
});

automationApp.get(
  "/internal/automations/campaigns/:campaignId/jobs/:jobId",
  async (context) => {
    const campaignId = parseId(context.req.param("campaignId"));
    const jobId = parseId(context.req.param("jobId"));
    return context.json(await getAutomationJob(context.env, campaignId, jobId));
  },
);

automationApp.post(
  "/internal/automations/campaigns/:campaignId/jobs/:jobId/retry",
  async (context) => {
    const campaignId = parseId(context.req.param("campaignId"));
    const jobId = parseId(context.req.param("jobId"));
    await parseJson(context.req.raw, RetryAutomationJobSchema);
    const job = await retryAutomationJob(context.env, campaignId, jobId);
    await enqueueSafely(context.env, {
      jobId,
      correlationId: context.get("correlationId"),
    });
    return context.json(job);
  },
);

automationApp.delete(
  "/internal/automations/campaigns/:campaignId/jobs/:jobId",
  async (context) => {
    const campaignId = parseId(context.req.param("campaignId"));
    const jobId = parseId(context.req.param("jobId"));
    await cancelAutomationJob(context.env, campaignId, jobId);
    return context.body(null, 204);
  },
);

automationApp.onError((error, context) => {
  if (error instanceof AutomationServiceError) {
    return context.json({ error: error.code, message: error.message }, error.status);
  }
  console.error(
    JSON.stringify({
      level: "error",
      code: "automation_request_failed",
      correlationId: context.get("correlationId"),
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  return context.json(
    { error: "internal_error", message: "Não foi possível concluir a operação." },
    500,
  );
});

export async function handleAutomationBatch(
  batch: AutomationBatch,
  env: AutomationEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = AutomationQueueMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      console.error(JSON.stringify({ level: "error", code: "invalid_automation_message" }));
      message.ack();
      continue;
    }
    await processAutomationMessage(env, parsed.data, message);
  }
}

async function processAutomationMessage(
  env: AutomationEnv,
  input: AutomationQueueMessage,
  message: Message<AutomationQueueMessage>,
): Promise<void> {
  const claim = await claimAutomationJob(env, input.jobId);
  if (!claim) {
    message.ack();
    return;
  }
  try {
    const generated = await generateAutomationDraft(env, claim.row);
    const portal = await createPortalAutomationDraft(
      env,
      {
        jobId: claim.row.id,
        campaignId: claim.row.campaign_id,
        requestedByUserId: claim.row.requested_by_user_id,
        kind: claim.row.kind,
        model: generated.model,
        target: claim.row.target_json ? JSON.parse(claim.row.target_json) : { type: "post" },
        ...generated.draft,
      },
      claim.row.correlation_id,
    );
    if (
      !(await completeAutomationJob(
        env,
        claim.row.id,
        claim.leaseToken,
        generated.draft,
        portal.postId,
        portal.summaryId,
        generated.model,
      ))
    ) {
      throw new Error("O lease da automação expirou antes da conclusão.");
    }
    message.ack();
  } catch (error) {
    const disposition = await failAutomationJob(
      env,
      claim.row.id,
      claim.leaseToken,
      error,
    );
    console.error(
      JSON.stringify({
        level: "error",
        code: "automation_generation_failed",
        jobId: claim.row.id,
        correlationId: claim.row.correlation_id,
        disposition,
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    if (disposition === "retry") message.retry({ delaySeconds: 30 });
    else message.ack();
  }
}

const automationWorker: ExportedHandler<AutomationEnv, AutomationQueueMessage> = {
  fetch(request, env, executionContext) {
    return automationApp.fetch(request, env, executionContext);
  },
  queue(batch, env) {
    return handleAutomationBatch(batch, env);
  },
  async scheduled(_controller, env) {
    const [purged, dispatchable] = await Promise.all([
      purgeAutomationSources(env),
      recoverAndListDispatchableJobs(env),
    ]);
    await Promise.all(dispatchable.map((message) => enqueueSafely(env, message)));
    console.log(
      JSON.stringify({
        level: "info",
        code: "automation_maintenance_completed",
        purged,
        requeued: dispatchable.length,
      }),
    );
  },
};

async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AutomationServiceError(400, "invalid_json", "Corpo JSON inválido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AutomationServiceError(422, "invalid_request", "Revise os dados enviados.");
  }
  return parsed.data;
}

function parseId(value: string): string {
  const parsed = EntityIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new AutomationServiceError(404, "automation_job_not_found", "Recurso não encontrado.");
  }
  return parsed.data;
}

function parseIdempotencyKey(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9:._-]{8,128}$/u.test(value)) {
    throw new AutomationServiceError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key é obrigatório.",
    );
  }
  return value;
}

async function enqueueSafely(
  env: AutomationEnv,
  message: AutomationQueueMessage,
): Promise<void> {
  try {
    await env.AUTOMATION_JOBS.send(message);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        code: "automation_enqueue_failed",
        jobId: message.jobId,
        correlationId: message.correlationId,
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
}

export { automationApp, processAutomationMessage };
export default automationWorker;
