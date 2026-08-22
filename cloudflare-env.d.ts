interface CloudflareEnv {
  DB: D1Database;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  SESSION_SECRET?: string;
  SITE_URL?: string;
  INTEGRATION_SERVICE_TOKEN?: string;
  DISCORD_PUBLICATIONS?: Queue<import("@vigilia/contracts").DiscordPostPublication>;
}
