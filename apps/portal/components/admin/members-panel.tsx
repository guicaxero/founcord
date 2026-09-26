"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddCampaignMemberInput,
  CampaignMember,
  CampaignMemberListResponse,
  CurrentUserResponse,
} from "@ordem/contracts";
import { motion } from "motion/react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Input, Select } from "@/components/ui/field";
import { listItem, staggerList } from "@/components/ui/motion";
import { Notice } from "@/components/ui/notice";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { formatDate, normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { Initial, PanelLoading, SearchField } from "./kit";

const roleDetails: Readonly<Record<string, { label: string; description: string }>> = {
  owner: { label: "Proprietário global", description: "Acesso total e protegido em todas as campanhas." },
  administrator: { label: "Administrador global", description: "Administra campanhas, pessoas, conteúdo e integrações." },
  campaign_manager: { label: "Gestor da campanha", description: "Coordena conteúdo, membros e configurações desta campanha." },
  gm: { label: "Mestre", description: "Conduz sessões, cria missões e atende pedidos." },
  editor: { label: "Editor", description: "Edita missões e prepara conteúdo para revisão." },
  moderator: { label: "Moderador", description: "Revisa e publica o conteúdo aprovado." },
  player: { label: "Jogador", description: "Participa da campanha e se inscreve nas missões." },
  automation: { label: "Automação", description: "Cria rascunhos por integrações autorizadas." },
};

const campaignRoleOptions = ["player", "gm", "editor", "moderator", "campaign_manager"] as const;

const statusContent: Readonly<Record<CampaignMember["status"], { label: string; tone: "success" | "warning" | "neutral" }>> = {
  active: { label: "Ativo", tone: "success" },
  suspended: { label: "Suspenso", tone: "warning" },
  left: { label: "Saiu", tone: "neutral" },
};

type MemberUpdate = { userId: string; body: Record<string, string> };

export function MembersPanel({
  campaignId,
  me,
}: Readonly<{ campaignId: string; me: CurrentUserResponse }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const suspendTriggerRef = useRef<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [suspending, setSuspending] = useState<CampaignMember | null>(null);
  const [search, setSearch] = useState("");
  const members = useQuery({
    queryKey: queryKeys.members(campaignId),
    queryFn: () => apiFetch<CampaignMemberListResponse>(`/api/campaigns/${campaignId}/members`),
  });
  const add = useMutation({
    mutationFn: (input: AddCampaignMemberInput) =>
      apiFetch<CampaignMember>(`/api/campaigns/${campaignId}/members`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (member) => {
      setAdding(false);
      toast({ title: "Membro adicionado", description: `${member.user.displayName} agora faz parte da campanha.` });
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(campaignId) });
    },
  });
  const update = useMutation({
    mutationFn: ({ userId, body }: MemberUpdate) =>
      apiFetch<CampaignMember>(`/api/campaigns/${campaignId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async (member, variables) => {
      setSuspending(null);
      toast({
        title: variables.body.removeRole
          ? "Papel removido"
          : variables.body.role
            ? "Papel concedido"
            : member.status === "active"
              ? "Participação reativada"
              : "Participação suspensa",
        description: member.user.displayName,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.members(campaignId) });
    },
    onError: (error, variables) => {
      if (variables.body.status === "suspended") return;
      toast({ title: "O membro não foi alterado", description: errorMessage(error), tone: "danger" });
    },
  });
  const canAssign = hasCapability(me, "role:assign", campaignId);

  if (members.isPending) return <PanelLoading label="Carregando membros" rows={3} />;
  if (members.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar os membros"
        tone="error"
        role="alert"
        action={<Button onClick={() => members.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(members.error)}
      </FeedbackState>
    );
  }

  const data = members.data.data;
  const query = normalizeSearch(search);
  const visible = query ? data.filter((member) => normalizeSearch(member.user.displayName).includes(query)) : data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SearchField label="Buscar pessoa" value={search} onChange={setSearch} placeholder="Nome no Discord" className="max-w-md" />
        <Button
          ref={addTriggerRef}
          variant="accent"
          onClick={() => {
            add.reset();
            setAdding(true);
          }}
        >
          Adicionar membro
        </Button>
      </div>
      <p className="text-sm text-fg-subtle" aria-live="polite">
        {visible.length === data.length
          ? `${data.length} ${data.length === 1 ? "pessoa" : "pessoas"} na campanha. Papéis globais e desta campanha aparecem separados.`
          : `${visible.length} de ${data.length} pessoas correspondem à busca.`}
      </p>

      {data.length === 0 ? (
        <FeedbackState title="Nenhum membro ainda" action={<Button variant="accent" onClick={() => setAdding(true)}>Adicionar a primeira pessoa</Button>}>
          A pessoa precisa ter entrado no portal pelo Discord pelo menos uma vez.
        </FeedbackState>
      ) : visible.length === 0 ? (
        <FeedbackState title="Ninguém com esse nome" action={<Button onClick={() => setSearch("")}>Limpar busca</Button>}>
          Confira a grafia do nome exibido no Discord.
        </FeedbackState>
      ) : (
        <motion.ul className="grid gap-4 xl:grid-cols-2" variants={staggerList} initial="hidden" animate="visible">
          {visible.map((member) => {
            const isCurrentUser = member.user.id === me.user?.id;
            const globalRoles = isCurrentUser
              ? me.assignments.filter((assignment) => assignment.scopeKind === "global").map((assignment) => assignment.roleName)
              : [];
            const isProtected = isCurrentUser && globalRoles.some((role) => role === "owner" || role === "administrator");
            return (
              <motion.li key={member.user.id} variants={listItem}>
                <MemberCard
                  member={member}
                  isCurrentUser={isCurrentUser}
                  globalRoles={globalRoles}
                  isProtected={isProtected}
                  canAssign={canAssign}
                  busy={update.isPending}
                  onUpdate={(body) => update.mutate({ userId: member.user.id, body })}
                  onSuspend={(trigger) => {
                    suspendTriggerRef.current = trigger;
                    update.reset();
                    setSuspending(member);
                  }}
                />
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <Dialog
        open={adding}
        onOpenChange={(next) => {
          if (!next && !add.isPending) setAdding(false);
        }}
        title="Adicionar à campanha"
        description="A pessoa precisa ter entrado no portal pelo Discord pelo menos uma vez."
        returnFocusRef={addTriggerRef}
        className="max-w-lg"
      >
        <AddMemberForm
          canAssign={canAssign}
          busy={add.isPending}
          error={add.isError ? errorMessage(add.error) : null}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => add.mutate(input)}
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(suspending)}
        title={`Suspender ${suspending?.user.displayName ?? ""}?`}
        description="A pessoa perde o acesso aos recursos desta campanha até ser reativada."
        confirmLabel="Suspender participação"
        busyLabel="Suspendendo…"
        busy={update.isPending}
        error={update.isError ? errorMessage(update.error) : null}
        onCancel={() => setSuspending(null)}
        onConfirm={() => suspending && update.mutate({ userId: suspending.user.id, body: { status: "suspended" } })}
        returnFocusRef={suspendTriggerRef}
      >
        <p>Papéis e histórico são mantidos. Você pode reativar a participação a qualquer momento.</p>
      </ConfirmDialog>
    </div>
  );
}

function MemberCard({
  member,
  isCurrentUser,
  globalRoles,
  isProtected,
  canAssign,
  busy,
  onUpdate,
  onSuspend,
}: Readonly<{
  member: CampaignMember;
  isCurrentUser: boolean;
  globalRoles: readonly string[];
  isProtected: boolean;
  canAssign: boolean;
  busy: boolean;
  onUpdate: (body: Record<string, string>) => void;
  onSuspend: (trigger: HTMLElement) => void;
}>) {
  const status = statusContent[member.status];
  const [grant, setGrant] = useState<(typeof campaignRoleOptions)[number]>("player");
  const grantable = campaignRoleOptions.filter((role) => !member.roles.includes(role));

  return (
    <Card className="flex h-full flex-col gap-5">
      <header className="flex items-start gap-3">
        <Initial name={member.user.displayName} avatarUrl={member.user.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg leading-tight break-words">{member.user.displayName}</h3>
            {isCurrentUser ? <Badge tone="accent">Você</Badge> : null}
          </div>
          <p className="text-xs text-fg-subtle">Membro desde {formatDate(member.joinedAt)}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      {globalRoles.length > 0 ? (
        <RoleList title="Acesso global" roles={globalRoles} protectedRoles />
      ) : null}
      <RoleList
        title="Papéis nesta campanha"
        roles={member.roles}
        empty="Nenhum papel local atribuído."
        onRemove={canAssign && !isProtected ? (role) => onUpdate({ removeRole: role }) : undefined}
        busy={busy}
      />

      <footer className="mt-auto space-y-3 border-t border-line-soft pt-4">
        {isProtected ? (
          <p className="text-sm text-fg-muted">
            <strong className="text-fg">Acesso protegido.</strong> Seu papel global não é alterado pelos controles desta campanha.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            {canAssign && grantable.length > 0 ? (
              <>
                <Field label="Conceder papel" className="min-w-40 flex-1">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={grantable.includes(grant) ? grant : grantable[0]}
                      onChange={(event) => setGrant(event.target.value as typeof grant)}
                      className="min-h-9 text-sm"
                    >
                      {grantable.map((role) => (
                        <option value={role} key={role}>{roleDetails[role]!.label}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onUpdate({ role: grantable.includes(grant) ? grant : grantable[0]! })}
                >
                  Conceder
                </Button>
              </>
            ) : null}
            {member.status === "active" ? (
              <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={(event) => onSuspend(event.currentTarget)}>
                Suspender
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => onUpdate({ status: "active" })}>
                Reativar participação
              </Button>
            )}
          </div>
        )}
      </footer>
    </Card>
  );
}

function RoleList({
  title,
  roles,
  empty,
  protectedRoles = false,
  onRemove,
  busy = false,
}: Readonly<{
  title: string;
  roles: readonly string[];
  empty?: string | undefined;
  protectedRoles?: boolean | undefined;
  onRemove?: ((role: string) => void) | undefined;
  busy?: boolean | undefined;
}>) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-bold tracking-wide text-fg-subtle uppercase">{title}</h4>
      {roles.length === 0 ? (
        <p className="text-sm text-fg-subtle">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {roles.map((role) => {
            const detail = roleDetails[role] ?? { label: role, description: "Papel adicional atribuído a este membro." };
            return (
              <li key={role} className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{detail.label}</p>
                  <p className="text-xs text-fg-subtle">{detail.description}</p>
                </div>
                {onRemove ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onRemove(role)}
                    aria-label={`Remover o papel ${detail.label}`}
                  >
                    Remover
                  </Button>
                ) : protectedRoles ? (
                  <Badge>Protegido</Badge>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddMemberForm({
  canAssign,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  canAssign: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: AddCampaignMemberInput) => void;
}>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      discordUserId: String(data.get("discordUserId")).trim(),
      role: canAssign ? (String(data.get("role")) as AddCampaignMemberInput["role"]) : "player",
    });
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <Field label="ID do usuário no Discord" hint="Aparece no perfil do Discord com o modo desenvolvedor ativo.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="discordUserId"
            required
            inputMode="numeric"
            pattern="[0-9]{5,25}"
            autoComplete="off"
            placeholder="Ex.: 231643587291512833"
            aria-describedby={describedBy}
          />
        )}
      </Field>
      {canAssign ? (
        <Field label="Papel inicial">
          {({ id }) => (
            <Select id={id} name="role" defaultValue="player">
              {campaignRoleOptions.map((role) => (
                <option value={role} key={role}>{roleDetails[role]!.label}</option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <p className="text-sm text-fg-muted">A pessoa entra como jogador.</p>
      )}
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Adicionando…" : "Adicionar membro"}
        </Button>
      </div>
    </form>
  );
}
