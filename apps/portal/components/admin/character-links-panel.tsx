"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CampaignCharacterLink,
  CampaignCharacterLinkInput,
  CampaignCharacterLinkManagementResponse,
  CampaignCharacterProjection,
  CampaignMember,
  CampaignMemberListResponse,
  FoundryWorldListResponse,
} from "@ordem/contracts";
import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Select } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { listItem, staggerList } from "@/components/ui/motion";
import { Notice } from "@/components/ui/notice";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { DetailList, Initial, PanelLoading, Stats } from "./kit";

type LinkMutation = Readonly<{ userId: string; input: CampaignCharacterLinkInput }>;
type Filter = "all" | "linked" | "unlinked";

export function CharacterLinksPanel({
  campaignId,
  initialMembers,
  initialLinks,
  initialWorlds,
}: Readonly<{
  campaignId: string;
  initialMembers?: CampaignMemberListResponse | undefined;
  initialLinks?: CampaignCharacterLinkManagementResponse | undefined;
  initialWorlds?: FoundryWorldListResponse | undefined;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const unlinkTriggerRef = useRef<HTMLElement | null>(null);
  const [unlinking, setUnlinking] = useState<Readonly<{ member: CampaignMember; link: CampaignCharacterLink }> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const members = useQuery({
    queryKey: queryKeys.members(campaignId),
    queryFn: () => apiFetch<CampaignMemberListResponse>(`/api/campaigns/${campaignId}/members`),
    initialData: initialMembers,
    enabled: initialMembers === undefined,
  });
  const links = useQuery({
    queryKey: queryKeys.characterLinks(campaignId),
    queryFn: () => apiFetch<CampaignCharacterLinkManagementResponse>(`/api/campaigns/${campaignId}/character-links`),
    initialData: initialLinks,
    enabled: initialLinks === undefined,
  });
  const worlds = useQuery({
    queryKey: queryKeys.foundryWorlds(campaignId),
    queryFn: () => apiFetch<FoundryWorldListResponse>(`/api/campaigns/${campaignId}/foundry/worlds`),
    initialData: initialWorlds,
    enabled: initialWorlds === undefined,
  });
  const save = useMutation({
    mutationFn: ({ userId, input }: LinkMutation) =>
      apiFetch<CampaignCharacterLink>(`/api/campaigns/${campaignId}/members/${userId}/character-link`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async (link) => {
      toast({ title: "Personagem vinculado", description: `${link.actorName} agora representa este membro no portal.` });
      await invalidateCharacterQueries(queryClient, campaignId);
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ removed: true }>(`/api/campaigns/${campaignId}/members/${userId}/character-link`, { method: "DELETE" }),
    onSuccess: async () => {
      setUnlinking(null);
      toast({ title: "Vínculo removido", description: "O ator continua intacto no Foundry." });
      await invalidateCharacterQueries(queryClient, campaignId);
    },
  });

  const activeMembers = (members.data?.data ?? []).filter((member) => member.status === "active");
  const currentLinks = useMemo(() => links.data?.data.links ?? [], [links.data]);
  const linkedActorKeys = useMemo(
    () => new Set(currentLinks.map((link) => actorKey(link.worldId, link.actorId))),
    [currentLinks],
  );
  const worldNames = useMemo(
    () => new Map((worlds.data?.data ?? []).map((world) => [world.worldId, world.worldTitle])),
    [worlds.data?.data],
  );
  const loadError = members.error ?? links.error;
  const linkFor = (member: CampaignMember) => currentLinks.find((link) => link.userId === member.user.id) ?? null;
  const linkedCount = activeMembers.filter((member) => linkFor(member)).length;
  const visibleMembers = activeMembers.filter((member) => {
    if (filter === "linked") return Boolean(linkFor(member));
    if (filter === "unlinked") return !linkFor(member);
    return true;
  });

  if (members.isPending || links.isPending) return <PanelLoading label="Carregando elenco" rows={3} />;
  if (loadError) {
    return (
      <FeedbackState
        title="Não foi possível carregar os vínculos"
        tone="error"
        role="alert"
        action={<Button onClick={() => void Promise.all([members.refetch(), links.refetch()])}>Tentar novamente</Button>}
      >
        {errorMessage(loadError)}
      </FeedbackState>
    );
  }

  return (
    <div className="space-y-8">
      <Stats
        label="Resumo do elenco"
        items={[
          { label: "Membros ativos", value: activeMembers.length },
          { label: "Com personagem", value: linkedCount },
          { label: "Personagens livres", value: (links.data?.data.candidates ?? []).filter((candidate) => !linkedActorKeys.has(actorKey(candidate.worldId, candidate.actorId))).length },
        ]}
      />

      <Notice tone="info" title="O vínculo não altera o mundo">
        Esta etapa só confirma a identidade. Nenhuma ficha, moeda ou item é modificado no Foundry.
      </Notice>

      {activeMembers.length === 0 ? (
        <FeedbackState title="Nenhum membro ativo nesta campanha">
          Adicione ou reative uma pessoa em “Pessoas e acessos” antes de vincular personagens.
        </FeedbackState>
      ) : links.data?.data.candidates.length === 0 && currentLinks.length === 0 ? (
        <FeedbackState title="Nenhum personagem sincronizado">
          Abra “Mundos do Foundry” e peça uma sincronização enquanto o mestre estiver conectado ao mundo.
        </FeedbackState>
      ) : (
        <section className="space-y-5" aria-label="Elenco da campanha">
          <FilterChips
            label="Filtrar elenco"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Todos", count: activeMembers.length },
              { value: "unlinked", label: "Sem vínculo", count: activeMembers.length - linkedCount },
              { value: "linked", label: "Vinculados", count: linkedCount },
            ]}
          />
          {visibleMembers.length === 0 ? (
            <FeedbackState title="Ninguém neste filtro" action={<Button onClick={() => setFilter("all")}>Mostrar todos</Button>}>
              {filter === "unlinked" ? "Todos os membros ativos já têm personagem." : "Nenhum membro tem personagem vinculado ainda."}
            </FeedbackState>
          ) : (
            <motion.ul key={filter} className="grid gap-4 xl:grid-cols-2" variants={staggerList} initial="hidden" animate="visible">
              {visibleMembers.map((member) => {
                const current = linkFor(member);
                const candidates = (links.data?.data.candidates ?? []).filter(
                  (candidate) =>
                    !linkedActorKeys.has(actorKey(candidate.worldId, candidate.actorId)) ||
                    (current?.worldId === candidate.worldId && current.actorId === candidate.actorId),
                );
                return (
                  <motion.li key={`${member.user.id}:${current?.id ?? "unlinked"}:${current?.actorId ?? "none"}`} variants={listItem}>
                    <CharacterLinkCard
                      member={member}
                      current={current}
                      candidates={candidates}
                      worldNames={worldNames}
                      busy={save.isPending || remove.isPending}
                      saving={save.isPending && save.variables?.userId === member.user.id}
                      error={save.isError && save.variables?.userId === member.user.id ? errorMessage(save.error) : null}
                      onSave={(input) => save.mutate({ userId: member.user.id, input })}
                      onUnlink={(trigger) => {
                        if (!current) return;
                        unlinkTriggerRef.current = trigger;
                        remove.reset();
                        setUnlinking({ member, link: current });
                      }}
                    />
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(unlinking)}
        title={`Desvincular ${unlinking?.link.actorName ?? ""}?`}
        description={`${unlinking?.member.user.displayName ?? "O membro"} perde a ficha integrada e os pedidos ao Mercador até receber outro vínculo.`}
        confirmLabel="Desvincular personagem"
        busyLabel="Desvinculando…"
        cancelLabel="Manter vínculo"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onCancel={() => setUnlinking(null)}
        onConfirm={() => unlinking && remove.mutate(unlinking.member.user.id)}
        returnFocusRef={unlinkTriggerRef}
      >
        <p>O ator continua no Foundry, sem nenhuma alteração.</p>
      </ConfirmDialog>
    </div>
  );
}

function CharacterLinkCard({
  member,
  current,
  candidates,
  worldNames,
  busy,
  saving,
  error,
  onSave,
  onUnlink,
}: Readonly<{
  member: CampaignMember;
  current: CampaignCharacterLink | null;
  candidates: readonly CampaignCharacterProjection[];
  worldNames: ReadonlyMap<string, string>;
  busy: boolean;
  saving: boolean;
  error: string | null;
  onSave: (input: CampaignCharacterLinkInput) => void;
  onUnlink: (trigger: HTMLElement) => void;
}>) {
  const [selection, setSelection] = useState(current ? actorKey(current.worldId, current.actorId) : "");
  const selected = candidates.find((candidate) => actorKey(candidate.worldId, candidate.actorId) === selection);
  const unchanged = Boolean(current && selected && current.worldId === selected.worldId && current.actorId === selected.actorId);
  const character = current?.character;

  return (
    <Card className="flex h-full flex-col gap-5">
      <header className="flex items-start gap-3">
        <Initial name={member.user.displayName} avatarUrl={member.user.avatarUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight break-words">{member.user.displayName}</h3>
          <p className="text-xs text-fg-subtle">{roleSummary(member.roles)}</p>
        </div>
        <LinkStatus current={current} />
      </header>

      {current ? (
        <div className="space-y-3 rounded-md border border-line-soft bg-surface-2 p-4">
          <div>
            <p className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">Personagem vinculado</p>
            <p className="font-display text-xl text-gold">{current.actorName}</p>
            <p className="text-sm text-fg-muted">
              {character ? characterDescriptor(character) : "Não encontrado na última sincronização"}
            </p>
          </div>
          {character ? (
            <DetailList
              className="grid-cols-3"
              items={[
                { label: "Vida", value: character.statistics.healthMax },
                { label: "Dano", value: character.statistics.damage },
                { label: "Atualizado", value: formatDateTime(character.lastSyncedAt) },
              ]}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-fg-muted">
          Sem personagem vinculado. A ficha integrada e os pedidos ao Mercador ficam indisponíveis para este membro.
        </p>
      )}

      <div className="mt-auto space-y-3 border-t border-line-soft pt-4">
        <Field
          label={current ? "Trocar personagem" : "Vincular personagem"}
          hint={candidates.length > 0 ? "Só aparecem personagens livres e ativos na última sincronização." : "Todos os personagens sincronizados já estão vinculados."}
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              value={selection}
              disabled={busy || candidates.length === 0}
              onChange={(event) => setSelection(event.target.value)}
              aria-describedby={describedBy}
            >
              <option value="">Selecione um personagem</option>
              {candidates.map((candidate) => (
                <option key={actorKey(candidate.worldId, candidate.actorId)} value={actorKey(candidate.worldId, candidate.actorId)}>
                  {candidate.name} — nível {candidate.level} · {worldNames.get(candidate.worldId) ?? "mundo sincronizado"}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !selected || unchanged}
            onClick={() => selected && onSave({ worldId: selected.worldId, actorId: selected.actorId })}
          >
            {saving ? "Salvando vínculo…" : "Salvar vínculo"}
          </Button>
          {current ? (
            <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={(event) => onUnlink(event.currentTarget)}>
              Desvincular
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function LinkStatus({ current }: Readonly<{ current: CampaignCharacterLink | null }>) {
  if (!current) return <Badge>Sem vínculo</Badge>;
  if (!current.character?.active) return <Badge tone="warning">Indisponível</Badge>;
  return <Badge tone="success">Vinculado</Badge>;
}

function actorKey(worldId: string, actorId: string): string {
  return `${worldId}:${actorId}`;
}

function roleSummary(roles: readonly string[]): string {
  const labels: Record<string, string> = {
    campaign_manager: "Gestor da campanha",
    gm: "Mestre",
    editor: "Editor",
    moderator: "Moderador",
    player: "Jogador",
  };
  return roles.map((role) => labels[role] ?? role).join(" · ") || "Membro da campanha";
}

function characterDescriptor(character: CampaignCharacterProjection): string {
  return [`Nível ${character.level}`, character.ancestry, character.paths.novice].filter(Boolean).join(" · ");
}

async function invalidateCharacterQueries(queryClient: ReturnType<typeof useQueryClient>, campaignId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.characterLinks(campaignId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.myCharacters }),
  ]);
}
