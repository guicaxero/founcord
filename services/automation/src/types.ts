import type { AutomationQueueMessage } from "@vigilia/contracts";

export type AutomationAiBinding = Readonly<{
  run(model: string, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}>;

export type AutomationEnv = Readonly<{
  AUTOMATION_DB: D1Database;
  AUTOMATION_JOBS: Queue<AutomationQueueMessage>;
  AI: AutomationAiBinding;
  PORTAL: Fetcher;
  AUTOMATION_SERVICE_TOKEN: string;
  AUTOMATION_MODEL?: string;
  AUTOMATION_DAILY_JOB_LIMIT?: string;
}>;

export type AutomationBatch = MessageBatch<AutomationQueueMessage>;
