export type FoundryEnv = Readonly<{
  INTEGRATION_DB: D1Database;
  PORTAL: Fetcher;
  FOUNDRY_ENROLLMENT_TOKEN: string;
  INTEGRATION_SERVICE_TOKEN: string;
}>;

export type AuthenticatedWorld = Readonly<{
  id: string;
  campaignId: string;
  worldInstanceId: string;
}>;
