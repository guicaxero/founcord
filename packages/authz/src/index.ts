export const permissions = [
  "audit:read",
  "automation:read",
  "automation:run",
  "campaign:manage",
  "character:link:manage",
  "character:self:read",
  "foundry:world:manage",
  "integration:manage",
  "member:manage",
  "mission:create",
  "mission:edit",
  "mission:publish",
  "mission:review",
  "post:create",
  "post:delete",
  "post:publish",
  "post:review",
  "role:assign",
  "session:manage",
  "session:read",
] as const;

export type Permission = (typeof permissions)[number];

export const roleNames = [
  "owner",
  "administrator",
  "campaign_manager",
  "gm",
  "editor",
  "moderator",
  "player",
  "automation",
] as const;

export type RoleName = (typeof roleNames)[number];

export type AuthorizationScope =
  | Readonly<{ kind: "global" }>
  | Readonly<{ kind: "campaign"; campaignId: string }>;

export type PermissionGrant = Readonly<{
  permission: Permission;
  scope: AuthorizationScope;
}>;

export type Principal = Readonly<{
  subjectId: string;
  grants: readonly PermissionGrant[];
}>;

export const rolePermissions = {
  owner: permissions,
  administrator: [
    "audit:read",
    "automation:read",
    "automation:run",
    "campaign:manage",
    "integration:manage",
    "member:manage",
    "mission:create",
    "mission:edit",
    "mission:publish",
    "mission:review",
    "post:create",
    "post:delete",
    "post:publish",
    "post:review",
    "role:assign",
    "session:manage",
    "session:read",
  ],
  campaign_manager: [
    "audit:read",
    "automation:read",
    "automation:run",
    "campaign:manage",
    "character:link:manage",
    "character:self:read",
    "foundry:world:manage",
    "integration:manage",
    "member:manage",
    "mission:create",
    "mission:edit",
    "mission:publish",
    "mission:review",
    "post:create",
    "post:publish",
    "post:review",
    "session:manage",
    "session:read",
  ],
  gm: [
    "automation:read",
    "automation:run",
    "character:link:manage",
    "character:self:read",
    "foundry:world:manage",
    "mission:create",
    "mission:edit",
    "post:create",
    "session:manage",
    "session:read",
  ],
  editor: [
    "automation:read",
    "character:self:read",
    "mission:edit",
    "post:create",
    "post:review",
    "session:read",
  ],
  moderator: ["character:self:read", "mission:review", "post:publish", "post:review"],
  player: ["character:self:read"],
  automation: ["post:create"],
} as const satisfies Readonly<Record<RoleName, readonly Permission[]>>;

export type RoleAssignment = Readonly<{
  roleName: RoleName;
  scope: AuthorizationScope;
}>;

export function principalFromRoleAssignments(
  subjectId: string,
  assignments: readonly RoleAssignment[],
): Principal {
  const grants = assignments.flatMap((assignment) =>
    rolePermissions[assignment.roleName].map((permission) => ({
      permission,
      scope: assignment.scope,
    })),
  );

  return { subjectId, grants };
}

export function permissionsForScope(
  principal: Principal,
  requestedScope: AuthorizationScope,
): Permission[] {
  return permissions.filter((permission) =>
    hasPermission(principal, permission, requestedScope),
  );
}

export function hasPermission(
  principal: Principal,
  permission: Permission,
  requestedScope: AuthorizationScope,
): boolean {
  return principal.grants.some(
    (grant) =>
      grant.permission === permission &&
      scopeIncludes(grant.scope, requestedScope),
  );
}

function scopeIncludes(
  grantedScope: AuthorizationScope,
  requestedScope: AuthorizationScope,
): boolean {
  if (grantedScope.kind === "global") return true;
  return (
    requestedScope.kind === "campaign" &&
    requestedScope.campaignId === grantedScope.campaignId
  );
}

export class AuthorizationError extends Error {
  constructor(permission: Permission) {
    super(`Missing required permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

export function requirePermission(
  principal: Principal,
  permission: Permission,
  scope: AuthorizationScope,
): void {
  if (!hasPermission(principal, permission, scope)) {
    throw new AuthorizationError(permission);
  }
}
