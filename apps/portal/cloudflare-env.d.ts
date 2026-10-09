interface CloudflareEnv {
  DB: D1Database;
  /** Bucket R2 das imagens enviadas ao portal (capas e galerias). */
  MEDIA?: R2Bucket;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  SESSION_SECRET?: string;
  SITE_URL?: string;
  FOUNDRY_BRIDGE_URL?: string;
  DISCORD_INTEGRATION_URL?: string;
  AUTOMATION_WORKER_URL?: string;
  INTEGRATION_SERVICE_TOKEN?: string;
  AUTOMATION_SERVICE_TOKEN?: string;
  DISCORD_PUBLICATIONS?: Queue<
    import("@ordem/contracts").DiscordPostPublication | import("@ordem/contracts").DiscordRegistroMessage
  >;
}
