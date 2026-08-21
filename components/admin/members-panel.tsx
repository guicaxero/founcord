"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddCampaignMemberInput,
  CampaignMember,
  CampaignMemberListResponse,
  CurrentUserResponse,
} from "@vigilia/contracts";
import type { FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";

export function MembersPanel({
  campaignId,
  me,
}: Readonly<{ campaignId: string; me: CurrentUserResponse }>) {
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: queryKeys.members(campaignId),
    queryFn: () =>
      apiFetch<CampaignMemberListResponse>(`/api/campaigns/${campaignId}/members`),
  });
  const add = useMutation({
    mutationFn: (input: AddCampaignMemberInput) =>
      apiFetch<CampaignMember>(`/api/campaigns/${campaignId}/members`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.members(campaignId) }),
  });
  const update = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: Record<string, string> }) =>
      apiFetch<CampaignMember>(
        `/api/campaigns/${campaignId}/members/${userId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.members(campaignId) }),
  });
  const canAssign = hasCapability(me, "role:assign", campaignId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    add.mutate({
      discordUserId: String(data.get("discordUserId")),
      role: canAssign
        ? (String(data.get("role")) as AddCampaignMemberInput["role"])
        : "player",
    });
    event.currentTarget.reset();
  }

  return (
    <div className="admin-two-column members-layout">
      <div>
        <div className="admin-section-title">
          <div><span>COMUNIDADE</span><h2>Membros</h2></div>
          <b>{members.data?.data.length ?? 0} pessoas</b>
        </div>
        <div className="member-table">
          {members.data?.data.map((member) => (
            <article key={member.user.id}>
              <div className="member-avatar">{member.user.displayName.slice(0, 1).toUpperCase()}</div>
              <div>
                <h3>{member.user.displayName}</h3>
                <p>{member.status}</p>
                <div className="role-chips">
                  {member.roles.length === 0 ? <span>sem papel</span> : null}
                  {member.roles.map((role) => (
                    <button
                      type="button"
                      key={role}
                      disabled={!canAssign}
                      onClick={() =>
                        update.mutate({
                          userId: member.user.id,
                          body: { removeRole: role },
                        })
                      }
                      title={canAssign ? `Remover ${role}` : role}
                    >
                      {role}{canAssign ? " ×" : ""}
                    </button>
                  ))}
                </div>
              </div>
              <div className="admin-row-actions">
                {member.status === "active" ? (
                  <button type="button" onClick={() => update.mutate({ userId: member.user.id, body: { status: "suspended" } })}>Suspender</button>
                ) : (
                  <button type="button" onClick={() => update.mutate({ userId: member.user.id, body: { status: "active" } })}>Reativar</button>
                )}
                {canAssign ? (
                  <select
                    aria-label={`Adicionar papel a ${member.user.displayName}`}
                    defaultValue=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      update.mutate({ userId: member.user.id, body: { role: event.target.value } });
                      event.target.value = "";
                    }}
                  >
                    <option value="">Adicionar papel…</option>
                    <option value="campaign_manager">Gestor</option>
                    <option value="gm">Mestre</option>
                    <option value="editor">Editor</option>
                    <option value="moderator">Moderador</option>
                    <option value="player">Jogador</option>
                  </select>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {members.isError ? <p className="inline-error">{errorMessage(members.error)}</p> : null}
        {update.isError ? <p className="inline-error">{errorMessage(update.error)}</p> : null}
      </div>
      <aside className="admin-editor">
        <div className="admin-section-title"><div><span>CONVITE</span><h2>Adicionar membro</h2></div></div>
        <form className="admin-form" onSubmit={submit}>
          <label className="full">ID do usuário Discord<input name="discordUserId" required /></label>
          {canAssign ? (
            <label className="full">Papel inicial<select name="role" defaultValue="player"><option value="player">Jogador</option><option value="gm">Mestre</option><option value="editor">Editor</option><option value="moderator">Moderador</option><option value="campaign_manager">Gestor</option></select></label>
          ) : (
            <p className="editorial-note full">O novo membro será adicionado como jogador.</p>
          )}
          <button className="admin-primary" disabled={add.isPending}>Adicionar</button>
        </form>
        <p className="editorial-note">A pessoa precisa ter entrado no portal pelo menos uma vez.</p>
        {add.isError ? <p className="inline-error">{errorMessage(add.error)}</p> : null}
      </aside>
    </div>
  );
}
