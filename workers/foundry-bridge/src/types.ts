export type FoundryEnv = Readonly<{
  INTEGRATION_DB: D1Database;
  PORTAL: Fetcher;
  INTEGRATION_SERVICE_TOKEN: string;
  PORTAL_URL?: string;
}>;

export type AuthenticatedWorld = Readonly<{
  id: string;
  campaignId: string;
  worldInstanceId: string;
}>;
