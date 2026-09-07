"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  CampaignCharacterProjection,
  PlayerCharacterListResponse,
} from "@vigilia/contracts";
import Link from "next/link";
import { FeedbackState } from "@/components/ui/feedback-state";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function PlayerCharacters({
  initialCharacters,
}: Readonly<{ initialCharacters?: PlayerCharacterListResponse }> = {}) {
  const characters = useQuery({
    queryKey: queryKeys.myCharacters,
    queryFn: () => apiFetch<PlayerCharacterListResponse>("/api/me/characters"),
    initialData: initialCharacters,
    enabled: initialCharacters === undefined,
  });

  if (characters.isPending) {
    return (
      <section className="player-character-loading" role="status" aria-label="Carregando seus personagens">
        <div><span /><span /><span /></div>
        <p>Consultando seus vínculos com o Foundry…</p>
      </section>
    );
  }

  if (characters.error instanceof ApiClientError && characters.error.status === 401) {
    return (
      <FeedbackState
        title="Entre para consultar seu personagem"
        action={(
          <a className="primary-action" href="/api/auth/discord?returnTo=/personagem">
            Entrar com Discord
          </a>
        )}
      >
        Sua conta do Discord identifica com segurança os vínculos feitos pela equipe da campanha.
      </FeedbackState>
    );
  }

  if (characters.isError) {
    return (
      <FeedbackState
        title="Não foi possível consultar seus personagens"
        tone="error"
        role="alert"
        action={(
          <button className="secondary-action" type="button" onClick={() => characters.refetch()}>
            Tentar novamente
          </button>
        )}
      >
        {errorMessage(characters.error)}
      </FeedbackState>
    );
  }

  const entries = characters.data?.data ?? [];
  if (entries.length === 0) {
    return (
      <FeedbackState title="Você ainda não participa de uma campanha ativa">
        Quando sua entrada for confirmada pela equipe, os personagens vinculados aparecerão aqui.
      </FeedbackState>
    );
  }

  return (
    <div className="player-character-list">
      {entries.map((entry) => (
        <section className="player-campaign-character" key={entry.campaign.id}>
          <header>
            <div>
              <span>Campanha</span>
              <h2>{entry.campaign.name}</h2>
            </div>
            <CharacterAvailability active={entry.link?.character?.active === true} linked={Boolean(entry.link)} />
          </header>

          {!entry.link ? (
            <div className="player-character-empty">
              <span className="player-character-mark" aria-hidden="true">◇</span>
              <div>
                <h3>Nenhum personagem vinculado</h3>
                <p>Peça a um mestre ou gestor da campanha para associar seu ator do Foundry.</p>
              </div>
            </div>
          ) : entry.link.character ? (
            <CharacterSheetSummary character={entry.link.character} />
          ) : (
            <div className="player-character-empty is-warning">
              <span className="player-character-mark" aria-hidden="true">!</span>
              <div>
                <h3>{entry.link.actorName} está temporariamente indisponível</h3>
                <p>O vínculo foi preservado, mas o ator não apareceu na última sincronização do Foundry.</p>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function CharacterSheetSummary({ character }: Readonly<{ character: CampaignCharacterProjection }>) {
  const paths = [
    character.paths.novice,
    character.paths.expert,
    character.paths.master,
    character.paths.legendary,
  ].filter(Boolean);

  return (
    <article className="player-character-sheet">
      <div className="player-character-identity">
        <span className="player-character-monogram" aria-hidden="true">
          {character.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p>Personagem vinculado</p>
          <h3>{character.name}</h3>
          <span>
            Nível {character.level}
            {character.ancestry ? ` · ${character.ancestry}` : ""}
          </span>
        </div>
      </div>

      <dl className="player-character-statistics">
        <div><dt>Vida</dt><dd>{character.statistics.healthMax}</dd></div>
        <div><dt>Dano</dt><dd>{character.statistics.damage}</dd></div>
        <div><dt>Cura</dt><dd>{character.statistics.healingRate}</dd></div>
        <div><dt>Insanidade</dt><dd>{character.statistics.insanity}</dd></div>
        <div><dt>Corrupção</dt><dd>{character.statistics.corruption}</dd></div>
      </dl>

      <div className="player-character-details">
        <div>
          <span>Caminhos conhecidos</span>
          <p>{paths.length > 0 ? paths.join(" · ") : "Nenhum caminho informado na ficha."}</p>
        </div>
        <div>
          <span>Última sincronização</span>
          <p>{formatDateTime(character.lastSyncedAt)}</p>
        </div>
      </div>

      <footer>
        <p>
          Esta é uma projeção segura e somente para consulta. Edição de ficha e compras serão liberadas em etapas posteriores.
        </p>
        <Link className="text-action" href="/mercador">Consultar o Mercador <span aria-hidden="true">→</span></Link>
      </footer>
    </article>
  );
}

function CharacterAvailability({ active, linked }: Readonly<{ active: boolean; linked: boolean }>) {
  if (!linked) return <span className="player-character-status is-unlinked">Aguardando vínculo</span>;
  if (!active) return <span className="player-character-status is-warning">Sincronização pendente</span>;
  return <span className="player-character-status is-active">Sincronizado</span>;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
