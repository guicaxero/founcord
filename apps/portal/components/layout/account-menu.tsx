"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@ordem/contracts";
import { usePathname, useRouter } from "next/navigation";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Menu, MenuButton, MenuLabel, MenuLink, MenuSeparator } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { canManage } from "./navigation";

export function AccountMenu() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
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
    return <Skeleton aria-label="Carregando sua conta" className="h-11 w-11 rounded-full" />;
  }

  if (!me.data?.authenticated || !me.data.user) {
    return (
      <ButtonAnchor
        variant="accent"
        href={`/api/auth/discord?returnTo=${encodeURIComponent(pathname)}`}
      >
        Entrar com Discord
      </ButtonAnchor>
    );
  }

  const user = me.data.user;
  const globalRole = me.data.assignments.find(
    (assignment) => assignment.scopeKind === "global",
  )?.roleName;

  return (
    <Menu
      label={`Conta de ${user.displayName}`}
      trigger={
        <Button
          variant="ghost"
          className="gap-3 rounded-full border border-line-soft pr-4 pl-1.5"
          aria-label={`Conta de ${user.displayName}`}
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-accent-soft font-display text-base text-accent"
          >
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-36 truncate sm:inline">{user.displayName}</span>
        </Button>
      }
    >
      <MenuLabel>{globalRole ? roleLabel(globalRole) : "Membro da Ordem"}</MenuLabel>
      <MenuLink href="/eu">Minha área</MenuLink>
      {canManage(me.data) ? <MenuLink href="/dashboard">Painel de gestão</MenuLink> : null}
      <MenuSeparator />
      <MenuButton onSelect={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending ? "Saindo…" : "Sair da conta"}
      </MenuButton>
    </Menu>
  );
}

function roleLabel(role: string): string {
  if (role === "owner") return "Proprietário global";
  if (role === "administrator") return "Administrador global";
  return "Membro da Ordem";
}
