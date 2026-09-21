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
import { useEffect, useMemo, useRef, useState } from "react";
import { FeedbackState } from "@/components/ui/feedback-state";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

type LinkMutation = Readonly<{
  userId: string;
  input: CampaignCharacterLinkInput;
}>;

export function CharacterLinksPanel({
  campaignId,
  initialMembers,
  initialLinks,
  initialWorlds,
}: Readonly<{
  campaignId: string;
  initialMembers?: CampaignMemberListResponse;
  initialLinks?: CampaignCharacterLinkManagementResponse;
  initialWorlds?: FoundryWorldListResponse;
}>) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const members = useQuery({
    queryKey: queryKeys.members(campaignId),
    queryFn: () =>
      apiFetch<CampaignMemberListResponse>(`/api/campaigns/${campaignId}/members`),
    initialData: initialMembers,
    enabled: initialMembers === undefined,
  });
  const links = useQuery({
    queryKey: queryKeys.characterLinks(campaignId),
    queryFn: () =>
      apiFetch<CampaignCharacterLinkManagementResponse>(
        `/api/campaigns/${campaignId}/character-links`,
      ),
    initialData: initialLinks,
    enabled: initialLinks === undefined,
  });
  const worlds = useQuery({
    queryKey: queryKeys.foundryWorlds(campaignId),
    queryFn: () =>
      apiFetch<FoundryWorldListResponse>(
        `/api/campaigns/${campaignId}/foundry/worlds`,
      ),
    initialData: initialWorlds,
    enabled: initialWorlds === undefined,
  });
  const save = useMutation({
    mutationFn: ({ userId, input }: LinkMutation) =>
      apiFetch<CampaignCharacterLink>(
        `/api/campaigns/${campaignId}/members/${userId}/character-link`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    onSuccess: async (link) => {
      setNotice(`${link.actorName} foi vinculado ao membro selecionado.`);
      await invalidateCharacterQueries(queryClient, campaignId);
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ removed: true }>(
        `/api/campaigns/${campaignId}/members/${userId}/character-link`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      setNotice("O vínculo foi removido. O ator permanece intacto no Foundry.");
      await invalidateCharacterQueries(queryClient, campaignId);
    },
  });

  const activeMembers = (members.data?.data ?? []).filter(
    (member) => member.status === "active",
  );
  const currentLinks = useMemo(() => links.data?.data.links ?? [], [links.data]);
  const linkedActorKeys = useMemo(
    () => new Set(currentLinks.map((link) => actorKey(link.worldId, link.actorId))),
    [currentLinks],
  );
  const worldNames = useMemo(
    () => new Map((worlds.data?.data ?? []).map((world) => [world.worldId, world.worldTitle])),
    [worlds.data?.data],
  );
  const loading = members.isPending || links.isPending;
  const loadError = members.error ?? links.error;

  return (
    <section className="character-management" aria-labelledby="character-roster-title">
      <div className="admin-section-title character-management-heading">
        <div>
          <span>Identidade integrada</span>
          <h2 id="character-roster-title">Elenco da campanha</h2>
          <p>Associe cada membro ao personagem correto sincronizado pelo Foundry.</p>
        </div>
        <b>{currentLinks.length === 1 ? "1 vínculo" : `${currentLinks.length} vínculos`}</b>
      </div>

      <aside className="character-safety-note">
        <span aria-hidden="true">◇</span>
        <div>
          <strong>O vínculo não altera o mundo</strong>
          <p>Esta etapa apenas confirma a identidade. Nenhuma ficha, moeda ou item será modificado.</p>
        </div>
      </aside>

      {notice ? <p className="inline-success" role="status">{notice}</p> : null}
      {loading ? (
        <CharacterRosterSkeleton />
      ) : loadError ? (
        <FeedbackState
          title="Não foi possível carregar os vínculos"
          tone="error"
          role="alert"
          action={(
            <button
              className="secondary-action"
              type="button"
              onClick={() => void Promise.all([members.refetch(), links.refetch()])}
            >
              Tentar novamente
            </button>
          )}
        >
          {errorMessage(loadError)}
        </FeedbackState>
      ) : activeMembers.length === 0 ? (
        <FeedbackState title="Nenhum membro ativo nesta campanha">
          Adicione ou reative uma pessoa em “Pessoas e acessos” antes de vincular personagens.
        </FeedbackState>
      ) : links.data?.data.candidates.length === 0 && currentLinks.length === 0 ? (
        <FeedbackState title="Nenhum personagem sincronizado">
          Abra “Mundos do Foundry” e solicite uma sincronização enquanto o módulo estiver conectado.
        </FeedbackState>
      ) : (
        <ul className="character-roster">
          {activeMembers.map((member) => {
            const current = currentLinks.find((link) => link.userId === member.user.id) ?? null;
            const candidates = (links.data?.data.candidates ?? []).filter(
              (candidate) =>
                !linkedActorKeys.has(actorKey(candidate.worldId, candidate.actorId)) ||
                (current?.worldId === candidate.worldId && current.actorId === candidate.actorId),
            );
            return (
              <CharacterLinkCard
                key={`${member.user.id}:${current?.id ?? "unlinked"}:${current?.actorId ?? "none"}`}
                member={member}
                current={current}
                candidates={candidates}
                worldNames={worldNames}
                busy={save.isPending || remove.isPending}
                error={
                  save.isError && save.variables?.userId === member.user.id
                    ? errorMessage(save.error)
                    : remove.isError && remove.variables === member.user.id
                      ? errorMessage(remove.error)
                      : null
                }
                onSave={(input) => {
                  setNotice(null);
                  save.mutate({ userId: member.user.id, input });
                }}
                onRemove={() => {
                  setNotice(null);
                  remove.mutate(member.user.id);
                }}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CharacterLinkCard({
  member,
  current,
  candidates,
  worldNames,
  busy,
  error,
  onSave,
  onRemove,
}: Readonly<{
  member: CampaignMember;
  current: CampaignCharacterLink | null;
  candidates: readonly CampaignCharacterProjection[];
  worldNames: ReadonlyMap<string, string>;
  busy: boolean;
  error: string | null;
  onSave: (input: CampaignCharacterLinkInput) => void;
  onRemove: () => void;
}>) {
  const [selection, setSelection] = useState(
    current ? actorKey(current.worldId, current.actorId) : "",
  );
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const selected = candidates.find(
    (candidate) => actorKey(candidate.worldId, candidate.actorId) === selection,
  );
  const character = current?.character;
  const available = candidates;

  useEffect(() => {
    if (!confirmingRemoval) return;
    const frame = requestAnimationFrame(() => keepButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirmingRemoval]);

  return (
    <li className="character-roster-card">
      <header>
        <span className="member-avatar" aria-hidden="true">
          {member.user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h3>{member.user.displayName}</h3>
          <p>{roleSummary(member.roles)}</p>
        </div>
        <CharacterLinkStatus current={current} />
      </header>

      {current ? (
        <div className="linked-character-summary">
          <div>
            <span>Personagem vinculado</span>
            <strong>{current.actorName}</strong>
            <small>
              {character
                ? characterDescriptor(character)
                : "Não encontrado na última sincronização"}
            </small>
          </div>
          {character ? (
            <dl>
              <div><dt>Vida</dt><dd>{character.statistics.healthMax}</dd></div>
              <div><dt>Dano</dt><dd>{character.statistics.damage}</dd></div>
              <div><dt>Atualizado</dt><dd>{formatRelativeSync(character.lastSyncedAt)}</dd></div>
            </dl>
          ) : null}
        </div>
      ) : (
        <p className="unlinked-character-copy">
          Sem personagem vinculado. A ficha integrada e as futuras compras ficam indisponíveis para este membro.
        </p>
      )}

      <details className="character-link-editor">
        <summary>{current ? "Alterar vínculo" : "Vincular personagem"}</summary>
        <div className="character-link-editor-body">
          <label>
            <span>Personagem do Foundry</span>
            <select
              value={selection}
              disabled={busy || available.length === 0}
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="">Selecione um personagem</option>
              {available.map((candidate) => (
                <option
                  key={actorKey(candidate.worldId, candidate.actorId)}
                  value={actorKey(candidate.worldId, candidate.actorId)}
                >
                  {candidate.name} — nível {candidate.level} · {worldNames.get(candidate.worldId) ?? "mundo sincronizado"}
                </option>
              ))}
            </select>
            <small>
              {available.length > 0
                ? "Apenas personagens livres e ativos na última sincronização aparecem aqui."
                : "Todos os personagens sincronizados já estão vinculados."}
            </small>
          </label>
          <div className="character-link-actions">
            <button
              className="admin-primary"
              type="button"
              disabled={busy || !selected || (current?.worldId === selected.worldId && current.actorId === selected.actorId)}
              onClick={() => selected && onSave({ worldId: selected.worldId, actorId: selected.actorId })}
            >
              {busy ? "Salvando vínculo…" : "Salvar vínculo"}
            </button>
            {current && !confirmingRemoval ? (
              <button
                ref={removeButton}
                className="danger-secondary"
                type="button"
                disabled={busy}
                onClick={() => setConfirmingRemoval(true)}
              >
                Desvincular personagem
              </button>
            ) : null}
          </div>

          {error ? <p className="inline-error" role="alert">{error}</p> : null}

          {current && confirmingRemoval ? (
            <div className="character-unlink-confirmation" role="alert">
              <div>
                <strong>Desvincular {current.actorName}?</strong>
                <p>O ator continuará no Foundry, mas este membro perderá o acesso integrado.</p>
              </div>
              <div>
                <button
                  ref={keepButton}
                  className="secondary-action"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingRemoval(false);
                    requestAnimationFrame(() => removeButton.current?.focus());
                  }}
                >
                  Manter vínculo
                </button>
                <button className="danger-secondary" type="button" disabled={busy} onClick={onRemove}>
                  {busy ? "Desvinculando…" : "Confirmar desvinculação"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function CharacterLinkStatus({ current }: Readonly<{ current: CampaignCharacterLink | null }>) {
  if (!current) return <span className="character-link-status is-unlinked">Sem vínculo</span>;
  if (!current.character?.active) {
    return <span className="character-link-status is-missing">Indisponível</span>;
  }
  return <span className="character-link-status is-linked">Vinculado</span>;
}

function CharacterRosterSkeleton() {
  return (
    <div className="character-roster character-roster-loading" role="status" aria-label="Carregando elenco">
      {[0, 1, 2].map((item) => <span key={item} aria-hidden="true" />)}
    </div>
  );
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
  return [
    `Nível ${character.level}`,
    character.ancestry,
    character.paths.novice,
  ].filter(Boolean).join(" · ");
}

function formatRelativeSync(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value)).replace(".", "");
}

async function invalidateCharacterQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  campaignId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.characterLinks(campaignId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.myCharacters }),
  ]);
}
