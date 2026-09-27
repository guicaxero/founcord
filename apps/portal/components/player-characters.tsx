"use client";

import { useQuery } from "@tanstack/react-query";
import type { CampaignCharacterProjection, PlayerCharacterListResponse } from "@ordem/contracts";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { CharacterImage } from "@/components/character-image";
import { CoinPurse } from "@/components/coins";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { listItem, staggerList } from "@/components/ui/motion";
import { Badge, Card, Skeleton } from "@/components/ui/surface";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export function PlayerCharacters({
  initialCharacters,
}: Readonly<{ initialCharacters?: PlayerCharacterListResponse }> = {}) {
  const pathname = usePathname();
  const characters = useQuery({
    queryKey: queryKeys.myCharacters,
    queryFn: () => apiFetch<PlayerCharacterListResponse>("/api/me/characters"),
    initialData: initialCharacters,
    enabled: initialCharacters === undefined,
  });

  if (characters.isPending) {
    return (
      <div className="grid gap-4" role="status" aria-label="Consultando seus vínculos">
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (characters.error instanceof ApiClientError && characters.error.status === 401) {
    return (
      <FeedbackState
        title="Entre para consultar seu personagem"
        action={
          <ButtonAnchor
            variant="accent"
            href={`/api/auth/discord?returnTo=${encodeURIComponent(pathname)}`}
          >
            Entrar com Discord
          </ButtonAnchor>
        }
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
        action={
          <Button variant="secondary" onClick={() => characters.refetch()}>
            Tentar novamente
          </Button>
        }
      >
        {errorMessage(characters.error)}
      </FeedbackState>
    );
  }

  const entries = characters.data?.data ?? [];
  if (entries.length === 0) {
    return (
      <FeedbackState title="Você ainda não participa de uma campanha ativa">
        Quando sua entrada for confirmada pela equipe, os personagens vinculados aparecem aqui.
      </FeedbackState>
    );
  }

  return (
    <motion.ul
      className="grid list-none gap-6 p-0"
      variants={staggerList}
      initial="hidden"
      animate="visible"
    >
      {entries.map((entry) => (
        <motion.li key={entry.campaign.id} variants={listItem}>
          <Card padding="lg" className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wider text-fg-subtle uppercase">
                  Campanha
                </p>
                <h3 className="font-display text-2xl leading-tight">{entry.campaign.name}</h3>
              </div>
              <CharacterAvailability
                active={entry.link?.character?.active === true}
                linked={Boolean(entry.link)}
              />
            </header>

            {!entry.link ? (
              <FeedbackState title="Nenhum personagem vinculado">
                Peça a um mestre ou gestor da campanha para associar seu ator do Foundry.
              </FeedbackState>
            ) : entry.link.character ? (
              <CharacterSheet character={entry.link.character} />
            ) : (
              <FeedbackState title={`${entry.link.actorName} está temporariamente indisponível`}>
                O vínculo foi preservado, mas o ator não apareceu na última sincronização do
                Foundry.
              </FeedbackState>
            )}
          </Card>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function CharacterSheet({ character }: Readonly<{ character: CampaignCharacterProjection }>) {
  const paths = [
    character.paths.novice,
    character.paths.expert,
    character.paths.master,
    character.paths.legendary,
  ].filter((path): path is string => Boolean(path));

  const statistics = [
    { label: "Vida", value: character.statistics.healthMax },
    { label: "Dano", value: character.statistics.damage },
    { label: "Cura", value: character.statistics.healingRate },
    { label: "Insanidade", value: character.statistics.insanity },
    { label: "Corrupção", value: character.statistics.corruption },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-5">
        <CharacterImage name={character.name} portraitUrl={character.portraitUrl} tokenUrl={character.tokenUrl} />
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wider text-fg-subtle uppercase">
            Personagem vinculado
          </p>
          <h4 className="font-display text-3xl leading-tight break-words">{character.name}</h4>
          <p className="text-sm text-fg-muted">
            Nível {character.level}
            {character.ancestry ? ` · ${character.ancestry}` : ""}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line-soft bg-line-soft sm:grid-cols-5">
        {statistics.map((statistic) => (
          <div className="bg-surface p-3 text-center" key={statistic.label}>
            <dt className="text-xs font-bold text-fg-subtle uppercase">{statistic.label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold">{statistic.value}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <h5 className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">
          Moedas
        </h5>
        {character.wealth ? (
          <CoinPurse wealth={character.wealth} label={`Moedas de ${character.name}`} />
        ) : (
          <p className="text-sm text-fg-muted">
            Saldo ainda não sincronizado. Ele aparece após a próxima sincronização do Foundry.
          </p>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h5 className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">
            Caminhos conhecidos
          </h5>
          <p className="mt-2 font-display text-fg-muted">
            {paths.length > 0 ? paths.join(" · ") : "Nenhum caminho informado na ficha."}
          </p>
        </div>
        <div>
          <h5 className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">
            Última sincronização
          </h5>
          <p className="mt-2 font-display text-fg-muted">
            {formatDateTime(character.lastSyncedAt)}
          </p>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-4">
        <p className="max-w-[60ch] text-xs text-fg-subtle">
          Esta é uma projeção somente para consulta. Moedas, itens e ficha continuam sendo alterados
          pelo mestre no Foundry.
        </p>
        <ButtonLink variant="link" href="/lojista">
          Consultar o Lojista →
        </ButtonLink>
      </footer>
    </div>
  );
}

function CharacterAvailability({ active, linked }: Readonly<{ active: boolean; linked: boolean }>) {
  if (!linked) return <Badge>Aguardando vínculo</Badge>;
  if (!active) return <Badge tone="warning">Sincronização pendente</Badge>;
  return <Badge tone="success">Sincronizado</Badge>;
}
