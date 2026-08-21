"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@vigilia/contracts";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function AccountMenu() {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
  });
  const logout = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      window.location.assign("/");
    },
  });

  if (!me.data?.authenticated) {
    return (
      <a className="login-button" href="/api/auth/discord?returnTo=/dashboard">
        Entrar com Discord
      </a>
    );
  }

  return (
    <div className="account-menu">
      <a href="/dashboard">{me.data.user?.displayName}</a>
      <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
        Sair
      </button>
    </div>
  );
}
