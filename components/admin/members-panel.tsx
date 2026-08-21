"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddCampaignMemberInput,
  CampaignMember,
  CampaignMemberListResponse,
  CurrentUserResponse,
} from "@vigilia/contracts";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";

const roleDetails: Readonly<Record<string, { label: string; description: string }>> = {
  owner: {
    label: "Proprietário global",
    description: "Acesso total e protegido em todas as campanhas.",
  },
  administrator: {
    label: "Administrador global",
    description: "Administra campanhas, pessoas, conteúdo e integrações.",
  },
  campaign_manager: {
    label: "Gestor da campanha",
    description: "Coordena conteúdo, membros e configurações desta campanha.",
  },
  gm: {
    label: "Mestre",
    description: "Cria e edita as próprias missões e publicações.",
  },
  editor: {
    label: "Editor",
    description: "Edita missões e prepara conteúdo para revisão.",
  },
  moderator: {
    label: "Moderador",
    description: "Revisa e publica o conteúdo aprovado.",
  },
  player: {
    label: "Jogador",
    description: "Participa da campanha e se inscreve nas missões.",
  },
  automation: {
    label: "Automação",
    description: "Cria rascunhos por integrações autorizadas.",
  },
};

export function MembersPanel({
  campaignId,
  me,
}: Readonly<{ campaignId: string; me: CurrentUserResponse }>) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
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
    onSuccess: async () => {
      setNotice("Membro adicionado à campanha.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(campaignId) });
    },
  });
  const update = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: Record<string, string> }) =>
      apiFetch<CampaignMember>(
        `/api/campaigns/${campaignId}/members/${userId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    onSuccess: async (_, variables) => {
      setNotice(
        variables.body.removeRole
          ? "Papel removido da campanha."
          : variables.body.role
            ? "Novo papel concedido."
            : "Situação do membro atualizada.",
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(campaignId) });
    },
  });
  const canAssign = hasCapability(me, "role:assign", campaignId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
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
      <section className="members-content">
        <div className="admin-section-title">
          <div>
            <span>Pessoas e acessos</span>
            <h2>Membros da campanha</h2>
            <p>Papéis globais e papéis desta campanha aparecem separados.</p>
          </div>
          <b>{members.data?.data.length ?? 0} pessoas</b>
        </div>

        {notice ? <p className="inline-success" role="status">{notice}</p> : null}
        {members.isLoading ? <MemberListSkeleton /> : null}
        {members.isError ? <p className="inline-error">{errorMessage(members.error)}</p> : null}
        {update.isError ? <p className="inline-error">{errorMessage(update.error)}</p> : null}

        <div className="member-list">
          {members.data?.data.map((member) => {
            const isCurrentUser = member.user.id === me.user?.id;
            const globalRoles = isCurrentUser
              ? me.assignments
                  .filter((assignment) => assignment.scopeKind === "global")
                  .map((assignment) => assignment.roleName)
              : [];
            const isProtectedOwner =
              isCurrentUser &&
              globalRoles.some((role) => role === "owner" || role === "administrator");

            return (
              <article className="member-card" key={member.user.id}>
                <header className="member-card-header">
                  <span className="member-avatar" aria-hidden="true">
                    {member.user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="member-identity">
                    <div>
                      <h3>{member.user.displayName}</h3>
                      {isCurrentUser ? <span className="you-label">Você</span> : null}
                    </div>
                    <p>Membro desde {formatDate(member.joinedAt)}</p>
                  </div>
                  <span className={`member-status status-${member.status}`}>
                    {statusLabel(member.status)}
                  </span>
                </header>

                <div className="member-access-sections">
                  <RoleGroup
                    title="Acesso global"
                    description="Válido em todas as campanhas."
                    roles={globalRoles}
                    empty={isCurrentUser ? "Nenhum papel global." : "Sem acesso global conhecido."}
                    protectedRole
                  />
                  <RoleGroup
                    title="Papéis nesta campanha"
                    description="Responsabilidades locais e cumulativas."
                    roles={member.roles}
                    empty="Nenhum papel local atribuído."
                    onRemove={
                      canAssign && !isProtectedOwner
                        ? (role) =>
                            update.mutate({
                              userId: member.user.id,
                              body: { removeRole: role },
                            })
                        : undefined
                    }
                    busy={update.isPending}
                  />
                </div>

                <footer className="member-card-footer">
                  {isProtectedOwner ? (
                    <div className="protected-access-note">
                      <strong>Acesso protegido</strong>
                      <span>Seu papel global de proprietário não é alterado por controles desta campanha.</span>
                    </div>
                  ) : (
                    <details className="member-management">
                      <summary>Gerenciar participação</summary>
                      <div className="member-management-body">
                        <button
                          type="button"
                          className={member.status === "active" ? "danger-secondary" : "secondary-action"}
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              userId: member.user.id,
                              body: {
                                status: member.status === "active" ? "suspended" : "active",
                              },
                            })
                          }
                        >
                          {member.status === "active" ? "Suspender participação" : "Reativar participação"}
                        </button>
                        {canAssign ? (
                          <RoleGrantControl
                            busy={update.isPending}
                            onGrant={(role) =>
                              update.mutate({
                                userId: member.user.id,
                                body: { role },
                              })
                            }
                          />
                        ) : null}
                      </div>
                    </details>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        {members.data?.data.length === 0 ? (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">O</span>
            <h3>Nenhum membro encontrado</h3>
            <p>Adicione a primeira pessoa depois que ela entrar no portal pelo Discord.</p>
          </div>
        ) : null}
      </section>

      <aside className="admin-card admin-editor">
        <div className="admin-section-title">
          <div>
            <span>Novo membro</span>
            <h2>Adicionar à campanha</h2>
            <p>A pessoa precisa ter entrado no portal pelo menos uma vez.</p>
          </div>
        </div>
        <form className="admin-form" onSubmit={submit}>
          <label className="full">
            ID do usuário Discord
            <input
              name="discordUserId"
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 231643587291512833"
            />
            <small>Encontrado no perfil do Discord com o modo desenvolvedor ativo.</small>
          </label>
          {canAssign ? (
            <label className="full">
              Papel inicial
              <select name="role" defaultValue="player">
                {campaignRoleOptions.map((role) => (
                  <option value={role} key={role}>{roleDetails[role]!.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className="editorial-note full">O novo membro será adicionado como jogador.</p>
          )}
          <button className="admin-primary full" disabled={add.isPending}>
            {add.isPending ? "Adicionando membro…" : "Adicionar membro"}
          </button>
        </form>
        {add.isError ? <p className="inline-error">{errorMessage(add.error)}</p> : null}
      </aside>
    </div>
  );
}

const campaignRoleOptions = [
  "player",
  "gm",
  "editor",
  "moderator",
  "campaign_manager",
] as const;

function RoleGroup({
  title,
  description,
  roles,
  empty,
  protectedRole = false,
  onRemove,
  busy = false,
}: Readonly<{
  title: string;
  description: string;
  roles: readonly string[];
  empty: string;
  protectedRole?: boolean;
  onRemove?: ((role: string) => void) | undefined;
  busy?: boolean;
}>) {
  return (
    <section className="role-group">
      <header><h4>{title}</h4><p>{description}</p></header>
      {roles.length === 0 ? (
        <p className="role-empty">{empty}</p>
      ) : (
        <ul className="role-list">
          {roles.map((role) => {
            const detail = roleDetails[role] ?? {
              label: role,
              description: "Papel adicional atribuído a este membro.",
            };
            return (
              <li key={role}>
                <span className={protectedRole ? "role-symbol is-protected" : "role-symbol"} aria-hidden="true">
                  {detail.label.slice(0, 1)}
                </span>
                <span className="role-copy"><strong>{detail.label}</strong><small>{detail.description}</small></span>
                {onRemove ? (
                  <button
                    type="button"
                    className="role-remove"
                    disabled={busy}
                    onClick={() => onRemove(role)}
                    aria-label={`Remover o papel ${detail.label}`}
                  >
                    Remover
                  </button>
                ) : protectedRole ? (
                  <span className="protected-label">Protegido</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RoleGrantControl({
  busy,
  onGrant,
}: Readonly<{ busy: boolean; onGrant: (role: string) => void }>) {
  const [role, setRole] = useState<(typeof campaignRoleOptions)[number]>("player");

  return (
    <div className="role-grant-control">
      <label>
        Conceder novo papel
        <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
          {campaignRoleOptions.map((option) => (
            <option value={option} key={option}>{roleDetails[option]!.label}</option>
          ))}
        </select>
      </label>
      <button type="button" className="secondary-action" disabled={busy} onClick={() => onGrant(role)}>
        Conceder papel
      </button>
    </div>
  );
}

function MemberListSkeleton() {
  return (
    <div className="member-list" aria-label="Carregando membros">
      {[0, 1].map((item) => <div className="member-skeleton" key={item} />)}
    </div>
  );
}

function statusLabel(status: CampaignMember["status"]): string {
  if (status === "active") return "Ativo";
  if (status === "suspended") return "Suspenso";
  return "Saiu";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value)).replace(".", "");
}
