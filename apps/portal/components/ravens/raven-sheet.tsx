"use client";

import { useQuery } from "@tanstack/react-query";
import type { RavenDetail, RavenMissionRef } from "@ordem/contracts";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { missionNumberLabel, outcomeLabels, outcomeTone } from "@/components/missions/mission-presentation";
import { ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { riseIn } from "@/components/ui/motion";
import { Badge, Card, Eyebrow, Skeleton } from "@/components/ui/surface";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { RavenPortrait } from "./raven-portrait";
import {
  attributeLabels,
  pathsLabel,
  ravenStatusLabels,
  ravenStatusTone,
  statLabels,
  valueOrDash,
} from "./raven-presentation";

/** Ficha pública de um Corvo. */
export function RavenSheet({ ravenId }: Readonly<{ ravenId: string }>) {
  const raven = useQuery({
    queryKey: ["ravens", ravenId],
    queryFn: () => apiFetch<RavenDetail>(`/api/ravens/${ravenId}`),
  });

  if (raven.isPending) {
    return (
      <div className="grid gap-8 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]" role="status" aria-label="Abrindo a ficha">
        <Skeleton className="aspect-[3/4]" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (raven.isError) {
    const notFound = raven.error instanceof ApiClientError && raven.error.status === 404;
    return (
      <FeedbackState
        title={notFound ? "Corvo não encontrado" : "Não foi possível abrir a ficha"}
        tone={notFound ? "neutral" : "error"}
        role={notFound ? undefined : "alert"}
        action={<ButtonLink href="/corvos">Voltar ao registro</ButtonLink>}
      >
        {notFound ? "Ele pode ter saído do registro público." : errorMessage(raven.error)}
      </FeedbackState>
    );
  }

  const data = raven.data;

  return (
    <motion.article className="space-y-8" variants={riseIn} initial="hidden" animate="visible">
      <ButtonLink variant="link" href="/corvos">
        ← Voltar ao registro
      </ButtonLink>

      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <RavenPortrait
          name={data.name}
          src={data.imageUrl}
          alt={`Retrato de ${data.name}`}
          className="aspect-[3/4] w-full max-w-sm rounded-lg border border-line-soft"
        />

        <div className="min-w-0 space-y-6">
          <header className="space-y-3">
            <Eyebrow>Registro dos Corvos</Eyebrow>
            <h1 className="font-display text-4xl leading-tight break-words text-balance sm:text-5xl">{data.name}</h1>
            <div className="flex flex-wrap gap-2">
              <Badge tone={ravenStatusTone[data.status]}>{ravenStatusLabels[data.status]}</Badge>
              {data.source === "manual" ? <Badge>Sem ficha no Foundry</Badge> : null}
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-2">
            <Block title="Identificação">
              <Facts
                items={[
                  ["Jogador", valueOrDash(data.playerName)],
                  ["Ancestralidade", valueOrDash(data.ancestry)],
                  ["Trilhas", valueOrDash(pathsLabel(data.paths))],
                  ["Nível", valueOrDash(data.level)],
                ]}
              />
            </Block>
            <Block title="Progresso">
              <Facts
                items={[
                  ["Sessões jogadas", String(data.sessionsPlayed)],
                  ["Missões concluídas", String(data.missionsCompleted)],
                  ["Missões fracassadas", String(data.missionsFailed)],
                ]}
              />
            </Block>
            <Block title="Vida na Sede">
              <Facts
                items={[
                  ["Última missão", <LastMission key="last" mission={data.lastMission} />],
                  [
                    "Atividades realizadas",
                    data.activities.length > 0 ? data.activities.join("; ") : "Nenhuma registrada",
                  ],
                ]}
              />
            </Block>
            <Block title="Atributos e status">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {[...attributeLabels.map(({ key, label }) => [label, data.attributes[key]] as const),
                  ...statLabels.map(({ key, label }) => [label, data.stats[key]] as const)].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-semibold text-fg-subtle uppercase">{label}</dt>
                    <dd className="font-display text-xl tabular-nums">{valueOrDash(value)}</dd>
                  </div>
                ))}
              </dl>
            </Block>
          </div>

          <section aria-labelledby="missoes-do-corvo" className="space-y-3">
            <h2 id="missoes-do-corvo" className="font-display text-2xl">
              Missões
            </h2>
            {data.missions.length === 0 ? (
              <p className="text-fg-muted">Nenhuma missão registrada com este Corvo ainda.</p>
            ) : (
              <ul className="space-y-2">
                {data.missions.map((mission) => (
                  <li key={mission.id}>
                    <MissionLine mission={mission} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </motion.article>
  );
}

function Block({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Card className="space-y-4">
      <h2 className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">{title}</h2>
      {children}
    </Card>
  );
}

function Facts({ items }: Readonly<{ items: readonly (readonly [string, ReactNode])[] }>) {
  return (
    <dl className="space-y-3">
      {items.map(([label, value]) => (
        <div key={label} className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-sm text-fg-subtle">{label}</dt>
          <dd className="min-w-0 font-semibold break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LastMission({ mission }: Readonly<{ mission: RavenDetail["lastMission"] }>) {
  if (!mission) return <>Nenhuma registrada</>;
  if ("label" in mission) return <>{mission.label}</>;
  const number = missionNumberLabel(mission.number);
  return (
    <Link
      href={`/missoes/${mission.id}`}
      className="rounded-sm underline decoration-line-strong underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {number ? `${number} - ${mission.title}` : mission.title}
    </Link>
  );
}

function MissionLine({ mission }: Readonly<{ mission: RavenMissionRef }>) {
  const number = missionNumberLabel(mission.number);
  return (
    <Link
      href={`/missoes/${mission.id}`}
      className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-md border border-line-soft bg-surface px-4 py-2 hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="min-w-0">
        {number ? <span className="mr-2 text-xs font-bold tracking-[0.12em] text-fg-subtle uppercase">{number}</span> : null}
        <span className="font-semibold">{mission.title}</span>
      </span>
      {mission.outcome ? <Badge tone={outcomeTone[mission.outcome]}>{outcomeLabels[mission.outcome]}</Badge> : null}
    </Link>
  );
}
