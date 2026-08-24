import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationQueueMessage } from "@vigilia/contracts";
import type { AutomationEnv } from "./types";

const repository = vi.hoisted(() => ({
  claimAutomationJob: vi.fn(),
  completeAutomationJob: vi.fn(),
  failAutomationJob: vi.fn(),
  createAutomationJob: vi.fn(),
  listAutomationJobs: vi.fn(),
  getAutomationJob: vi.fn(),
  retryAutomationJob: vi.fn(),
  cancelAutomationJob: vi.fn(),
  purgeAutomationSources: vi.fn(),
}));
const generator = vi.hoisted(() => ({ generateAutomationDraft: vi.fn() }));
const portal = vi.hoisted(() => ({ createPortalAutomationDraft: vi.fn() }));

vi.mock("./repository", () => repository);
vi.mock("./generator", () => generator);
vi.mock("./portal-client", () => portal);

import { processAutomationMessage } from "./index";

const jobId = "22222222-2222-4222-8222-222222222222";
const campaignId = "11111111-1111-4111-8111-111111111111";
const requesterId = "33333333-3333-4333-8333-333333333333";
const postId = "44444444-4444-4444-8444-444444444444";
const correlationId = "55555555-5555-4555-8555-555555555555";

describe("Automation Worker queue", () => {
  let env: AutomationEnv;
  let message: Message<AutomationQueueMessage>;

  beforeEach(() => {
    vi.clearAllMocks();
    env = {
      AUTOMATION_DB: {} as D1Database,
      AUTOMATION_JOBS: {} as Queue<AutomationQueueMessage>,
      AI: { run: vi.fn() },
      PORTAL: {} as Fetcher,
      AUTOMATION_SERVICE_TOKEN: "s".repeat(64),
    };
    message = {
      id: "queue-message",
      timestamp: new Date(),
      attempts: 1,
      body: { jobId, correlationId },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    repository.claimAutomationJob.mockResolvedValue({
      leaseToken: "lease-token",
      row: {
        id: jobId,
        campaign_id: campaignId,
        requested_by_user_id: requesterId,
        kind: "session_summary",
        source_content: "Registro suficientemente longo para o processamento editorial.",
        suggested_title: null,
        instructions: null,
        correlation_id: correlationId,
      },
    });
    generator.generateAutomationDraft.mockResolvedValue({
      model: "@cf/meta/llama-3.1-8b-instruct",
      draft: {
        title: "Resumo da patrulha",
        body: "## Resumo\n\nA patrulha alcançou o moinho e preservou os registros encontrados.",
      },
    });
    portal.createPortalAutomationDraft.mockResolvedValue({
      postId,
      status: "pending_review",
      duplicate: false,
    });
    repository.completeAutomationJob.mockResolvedValue(true);
  });

  it("creates only a review draft and acknowledges the queue message", async () => {
    await processAutomationMessage(env, { jobId, correlationId }, message);
    expect(portal.createPortalAutomationDraft).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ jobId, campaignId, requestedByUserId: requesterId }),
      correlationId,
    );
    expect(repository.completeAutomationJob).toHaveBeenCalledWith(
      env,
      jobId,
      "lease-token",
      expect.any(Object),
      postId,
      "@cf/meta/llama-3.1-8b-instruct",
    );
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries a transient failure without losing the persisted job", async () => {
    generator.generateAutomationDraft.mockRejectedValue(new Error("AI unavailable"));
    repository.failAutomationJob.mockResolvedValue("retry");
    await processAutomationMessage(env, { jobId, correlationId }, message);
    expect(repository.failAutomationJob).toHaveBeenCalledWith(
      env,
      jobId,
      "lease-token",
      expect.any(Error),
    );
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it("acknowledges duplicate deliveries that cannot acquire the job lease", async () => {
    repository.claimAutomationJob.mockResolvedValue(null);
    await processAutomationMessage(env, { jobId, correlationId }, message);
    expect(generator.generateAutomationDraft).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
  });
});
