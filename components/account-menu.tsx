"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@vigilia/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

const managementPermissions = new Set([
  "audit:read",
  "automation:read",
  "automation:run",
  "campaign:manage",
  "character:link:manage",
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
]);

export function AccountMenu() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
  });
  const logout = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.replace("/");
      router.refresh();
    },
  });

  if (me.isLoading) {
    return <span className="account-loading" aria-label="Carregando sua conta" />;
  }

  if (!me.data?.authenticated || !me.data.user) {
    return (
      <a className="login-button" href="/api/auth/discord?returnTo=/">
        Entrar com Discord
      </a>
    );
  }

  const canManage = me.data.capabilities.some((capability) =>
    managementPermissions.has(capability.permission),
  );
  const globalRole = me.data.assignments.find(
    (assignment) => assignment.scopeKind === "global",
  )?.roleName;

  return (
    <div className="account-menu">
      <span className="account-avatar" aria-hidden="true">
        {me.data.user.displayName.slice(0, 1).toUpperCase()}
      </span>
      <span className="account-copy">
        <strong>{me.data.user.displayName}</strong>
        <small>{globalRole ? roleLabel(globalRole) : "Membro da Ordem"}</small>
      </span>
      {canManage ? (
        <Link className="account-action" href="/dashboard">Painel de gestão</Link>
      ) : (
        <Link className="account-action" href="/personagem">Meu personagem</Link>
      )}
      <button
        className="account-logout"
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        {logout.isPending ? "Saindo…" : "Sair"}
      </button>
    </div>
  );
}

function roleLabel(role: string): string {
  if (role === "owner") return "Proprietário global";
  if (role === "administrator") return "Administrador global";
  return "Membro da Ordem";
}
