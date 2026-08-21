import type { Permission } from "@vigilia/authz";
import type { CurrentUserResponse } from "@vigilia/contracts";

export function hasCapability(
  me: CurrentUserResponse | undefined,
  permission: Permission,
  campaignId?: string,
): boolean {
  return Boolean(
    me?.capabilities.some(
      (capability) =>
        capability.permission === permission &&
        (capability.scopeKind === "global" || capability.scopeId === campaignId),
    ),
  );
}
