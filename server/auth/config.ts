import { env } from "cloudflare:workers";
import { HttpError } from "../http";

export type AuthConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sessionSecret: string;
}>;

export function getAuthConfig(request: Request): AuthConfig {
  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const sessionSecret = env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret || sessionSecret.length < 32) {
    throw new HttpError(
      503,
      "auth_not_configured",
      "O login Discord ainda aguarda as credenciais da aplicação.",
    );
  }

  return {
    clientId,
    clientSecret,
    sessionSecret,
    redirectUri:
      env.DISCORD_REDIRECT_URI ??
      new URL("/api/auth/discord/callback", request.url).toString(),
  };
}
