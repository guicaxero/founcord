import {
  permissionsForScope,
  principalFromRoleAssignments,
  roleNames,
  type AuthorizationScope,
  type Principal,
  type RoleAssignment,
  type RoleName,
} from "@vigilia/authz";
import type { User } from "@vigilia/contracts";
import { getD1 } from "@/db";
import { HttpError } from "../http";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "../constants";
import { makeCookie, readCookie } from "./cookies";
import { randomToken, sha256 } from "./crypto";

type UserIdentityRow = Readonly<{
  user_id: string;
  discord_user_id: string;
  display_name: string;
  avatar_url: string | null;
}>;

type SessionRow = UserIdentityRow &
  Readonly<{
    session_id: string;
    expires_at: string;
  }>;

type AssignmentRow = Readonly<{
  role_name: string;
  scope_kind: "global" | "campaign";
  scope_id: string;
}>;

export type AuthenticatedSession = Readonly<{
  sessionId: string;
  user: User;
  principal: Principal;
  assignments: readonly RoleAssignment[];
}>;

export async function createSession(
  request: Request,
  userId: string,
): Promise<string> {
  const token = randomToken();
  const sessionId = await sha256(token);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1_000,
  ).toISOString();
  await getD1()
    .prepare(
      `INSERT INTO iam_sessions (id, user_id, expires_at)
       VALUES (?, ?, ?)`,
    )
    .bind(sessionId, userId, expiresAt)
    .run();
  return makeCookie(request, SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getOptionalSession(
  request: Request,
): Promise<AuthenticatedSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const sessionId = await sha256(token);
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT
        s.id AS session_id, s.expires_at,
        u.id AS user_id, u.discord_user_id, u.display_name, u.avatar_url
       FROM iam_sessions s
       JOIN iam_users u ON u.id = s.user_id
       WHERE s.id = ? AND datetime(s.expires_at) > CURRENT_TIMESTAMP`,
    )
    .bind(sessionId)
    .first<SessionRow>();
  if (!row) return null;

  return hydrateAuthenticatedSession(row, row.session_id);
}

export async function getSessionForDiscordUser(
  discordUserId: string,
): Promise<AuthenticatedSession | null> {
  const row = await getD1()
    .prepare(
      `SELECT
        u.id AS user_id, u.discord_user_id, u.display_name, u.avatar_url
       FROM iam_users u
       WHERE u.discord_user_id = ?`,
    )
    .bind(discordUserId)
    .first<UserIdentityRow>();
  if (!row) return null;

  return hydrateAuthenticatedSession(row, `discord:${discordUserId}`);
}

export async function getSessionForUserId(
  userId: string,
): Promise<AuthenticatedSession | null> {
  const row = await getD1()
    .prepare(
      `SELECT
        u.id AS user_id, u.discord_user_id, u.display_name, u.avatar_url
       FROM iam_users u
       WHERE u.id = ?`,
    )
    .bind(userId)
    .first<UserIdentityRow>();
  if (!row) return null;
  return hydrateAuthenticatedSession(row, `internal:${userId}`);
}

async function hydrateAuthenticatedSession(
  row: UserIdentityRow,
  sessionId: string,
): Promise<AuthenticatedSession> {
  const db = getD1();

  const result = await db
    .prepare(
      `SELECT ra.role_name, ra.scope_kind, ra.scope_id
       FROM iam_role_assignments ra
       LEFT JOIN campaign_members cm
         ON ra.scope_kind = 'campaign'
        AND cm.campaign_id = ra.scope_id
        AND cm.user_id = ra.user_id
       WHERE ra.user_id = ?
         AND (
           ra.scope_kind = 'global'
           OR (ra.scope_kind = 'campaign' AND cm.status = 'active')
         )`,
    )
    .bind(row.user_id)
    .all<AssignmentRow>();
  const assignments = result.results.flatMap((assignment) => {
    if (!isRoleName(assignment.role_name)) return [];
    const scope: AuthorizationScope =
      assignment.scope_kind === "global"
        ? { kind: "global" }
        : { kind: "campaign", campaignId: assignment.scope_id };
    return [{ roleName: assignment.role_name, scope }];
  });

  return {
    sessionId,
    user: {
      id: row.user_id,
      discordUserId: row.discord_user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
    principal: principalFromRoleAssignments(row.user_id, assignments),
    assignments,
  };
}

export async function requireSession(
  request: Request,
): Promise<AuthenticatedSession> {
  const session = await getOptionalSession(request);
  if (!session) {
    throw new HttpError(401, "unauthenticated", "Entre com o Discord para continuar.");
  }
  return session;
}

export async function destroySession(request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  await getD1()
    .prepare("DELETE FROM iam_sessions WHERE id = ?")
    .bind(await sha256(token))
    .run();
}

export function capabilitiesForSession(session: AuthenticatedSession) {
  const scopes: AuthorizationScope[] = [{ kind: "global" }];
  for (const assignment of session.assignments) {
    if (assignment.scope.kind === "campaign") {
      const campaignId = assignment.scope.campaignId;
      if (!scopes.some(
        (scope) =>
          scope.kind === "campaign" &&
          scope.campaignId === campaignId,
      )) {
        scopes.push(assignment.scope);
      }
    }
  }

  return scopes.flatMap((scope) =>
    permissionsForScope(session.principal, scope).map((permission) => ({
      permission,
      scopeKind: scope.kind,
      scopeId: scope.kind === "global" ? "*" : scope.campaignId,
    })),
  );
}

function isRoleName(value: string): value is RoleName {
  return roleNames.some((roleName) => roleName === value);
}
