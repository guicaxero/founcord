declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    DISCORD_REDIRECT_URI?: string;
    SESSION_SECRET?: string;
  }
}
