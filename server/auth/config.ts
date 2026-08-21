import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HttpError } from "../http";

export type AuthConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sessionSecret: string;
}>;

export function getAuthConfig(request: Request): AuthConfig {
  const { env } = getCloudflareContext();
  const clientId = env.DISCORD_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET ?? process.env.DISCORD_CLIENT_SECRET;
  const sessionSecret = env.SESSION_SECRET ?? process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret || sessionSecret.length < 32) {
    const missing = [
      !clientId ? "DISCORD_CLIENT_ID" : null,
      !clientSecret ? "DISCORD_CLIENT_SECRET" : null,
      !sessionSecret || sessionSecret.length < 32 ? "SESSION_SECRET_MIN_32" : null,
    ].filter((key): key is string => key !== null);
    console.error("OAuth Discord incompleto", { missing });
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
      env.DISCORD_REDIRECT_URI ?? process.env.DISCORD_REDIRECT_URI ??
      new URL("/api/auth/discord/callback", request.url).toString(),
  };
}
