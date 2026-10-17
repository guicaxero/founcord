import { getD1 } from "@/server/shared/db";
import { prepareAudit } from "@/server/shared/audit";
import { getAuthConfig } from "@/server/identity/config";
import { clearCookie, readCookie } from "@/server/identity/cookies";
import { decodeOAuthState } from "@/server/identity/oauth-state";
import { createSession } from "@/server/identity/session";
import {
  DEFAULT_CAMPAIGN_ID,
  LEGACY_OAUTH_COOKIE,
  OAUTH_COOKIE,
} from "@/server/shared/constants";
import { HttpError, withApiHandler } from "@/server/shared/http";

export const dynamic = "force-dynamic";

type DiscordUser = Readonly<{
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}>;

type UserIdRow = Readonly<{ id: string }>;

export const GET = withApiHandler(async ({ request, correlationId }) => {
  const config = getAuthConfig(request);
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnedState = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");
  if (oauthError) {
    throw new HttpError(400, "discord_oauth_denied", "O login pelo Discord foi cancelado.");
  }
  if (!code || !returnedState) {
    throw new HttpError(400, "missing_oauth_code", "A resposta do Discord está incompleta.");
  }

  const stateCookie =
    readCookie(request, OAUTH_COOKIE) ?? readCookie(request, LEGACY_OAUTH_COOKIE);
  if (!stateCookie) {
    throw new HttpError(400, "missing_oauth_state", "A tentativa de login expirou.");
  }
  const state = await decodeOAuthState(stateCookie, config.sessionSecret);
  if (state.state !== returnedState) {
    throw new HttpError(400, "oauth_state_mismatch", "A tentativa de login não é válida.");
  }

  const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: state.verifier,
    }),
  });
  if (!tokenResponse.ok) {
    throw new HttpError(502, "discord_token_failed", "O Discord não concluiu o login.");
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) {
    throw new HttpError(502, "discord_token_missing", "O Discord não concluiu o login.");
  }

  const profileResponse = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) {
    throw new HttpError(502, "discord_profile_failed", "Não foi possível ler o perfil Discord.");
  }
  const profile = (await profileResponse.json()) as DiscordUser;
  if (!profile.id || !profile.username) {
    throw new HttpError(502, "discord_profile_invalid", "O perfil Discord retornado é inválido.");
  }

  const db = getD1();
  const userId = crypto.randomUUID();
  const avatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128`
    : null;
  const user = await db
    .prepare(
      `INSERT INTO iam_users (id, discord_user_id, display_name, discord_name, avatar_url)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(discord_user_id) DO UPDATE SET
         discord_name = excluded.discord_name,
         -- O nome escolhido no portal vale mais que o do Discord.
         display_name = COALESCE(iam_users.portal_name, excluded.display_name),
         avatar_url = excluded.avatar_url,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
    )
    .bind(
      userId,
      profile.id,
      profile.global_name ?? profile.username,
      profile.global_name ?? profile.username,
      avatarUrl,
    )
    .first<UserIdRow>();
  if (!user) {
    throw new HttpError(500, "user_upsert_failed", "Não foi possível criar o perfil.");
  }

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, status)
         SELECT ?, ?, 'active' WHERE EXISTS (
           SELECT 1 FROM campaigns WHERE id = ? AND status = 'active'
         )`,
      )
      .bind(DEFAULT_CAMPAIGN_ID, user.id, DEFAULT_CAMPAIGN_ID),
    db
      .prepare(
        `INSERT OR IGNORE INTO iam_role_assignments (
          id, user_id, role_name, scope_kind, scope_id, granted_by
        ) SELECT ?, ?, 'player', 'campaign', ?, NULL
          WHERE EXISTS (SELECT 1 FROM campaigns WHERE id = ? AND status = 'active')`,
      )
      .bind(crypto.randomUUID(), user.id, DEFAULT_CAMPAIGN_ID, DEFAULT_CAMPAIGN_ID),
    db
      .prepare(
        `INSERT OR IGNORE INTO iam_role_assignments (
          id, user_id, role_name, scope_kind, scope_id, granted_by
        ) SELECT ?, ?, 'owner', 'global', '*', NULL
          WHERE NOT EXISTS (
            SELECT 1 FROM iam_role_assignments
            WHERE role_name IN ('owner', 'administrator') AND scope_kind = 'global'
          )`,
      )
      .bind(crypto.randomUUID(), user.id),
    prepareAudit(db, {
      actorUserId: user.id,
      campaignId: DEFAULT_CAMPAIGN_ID,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      correlationId,
      details: { provider: "discord" },
    }),
  ]);

  const headers = new Headers({
    location: new URL(state.returnTo, request.url).toString(),
    "cache-control": "no-store",
  });
  headers.append(
    "set-cookie",
    clearCookie(request, OAUTH_COOKIE, "/api/auth/discord/callback"),
  );
  // Limpa também o cookie de estado anterior à renomeação do portal.
  headers.append(
    "set-cookie",
    clearCookie(request, LEGACY_OAUTH_COOKIE, "/api/auth/discord/callback"),
  );
  headers.append("set-cookie", await createSession(request, user.id));
  return new Response(null, { status: 302, headers });
});
