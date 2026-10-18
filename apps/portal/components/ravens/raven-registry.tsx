"use client";

import { useQuery } from "@tanstack/react-query";
import type { RavenListResponse, RavenStatus, RavenSummary } from "@ordem/contracts";
import { motion } from "motion/react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { listItem, staggerList } from "@/components/ui/motion";
import { Badge, Card, Skeleton } from "@/components/ui/surface";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { RavenPortrait } from "./raven-portrait";
import { identityLine, pathsLabel, ravenStatusLabels, ravenStatusTone } from "./raven-presentation";

type Filter = "todos" | RavenStatus;

/** Hub público do Registro dos Corvos. */
export function RavenRegistry({ campaignId }: Readonly<{ campaignId: string }>) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const ravens = useQuery({
    queryKey: queryKeys.ravens(campaignId),
    queryFn: () => apiFetch<RavenListResponse>(`/api/campaigns/${campaignId}/ravens`),
  });

  const all = useMemo(() => ravens.data?.data ?? [], [ravens.data]);
  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    return all.filter((raven) => {
      if (filter !== "todos" && raven.status !== filter) return false;
      if (!term) return true;
      return normalizeSearch(
        [raven.name, raven.playerName, raven.ancestry, pathsLabel(raven.paths)].filter(Boolean).join(" "),
      ).includes(term);
    });
  }, [all, filter, search]);

  if (ravens.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Consultando o registro">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
        <Skeleton className="h-96 max-lg:hidden" />
      </div>
    );
  }

  if (ravens.isError) {
    return (
      <FeedbackState
        title="Não foi possível consultar o registro"
        tone="error"
        role="alert"
        action={
          <Button variant="secondary" onClick={() => ravens.refetch()}>
            Tentar novamente
          </Button>
        }
      >
        {errorMessage(ravens.error)}
      </FeedbackState>
    );
  }

  if (all.length === 0) {
    return (
      <FeedbackState title="Nenhum Corvo no registro ainda">
        Os Corvos aparecem aqui quando o mestre vincula os personagens do Foundry aos jogadores ou
        cadastra um Corvo no painel.
      </FeedbackState>
    );
  }

  const count = (status: RavenStatus) => all.filter((raven) => raven.status === status).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1 space-y-2">
          <label className="block text-sm font-semibold text-fg-muted" htmlFor={searchId}>
            Buscar Corvo
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome, jogador, ancestralidade ou trilha"
            autoComplete="off"
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </div>
        <FilterChips
          label="Filtrar Corvos por situação"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todos", label: "Todos", count: all.length },
            { value: "active", label: "Na ativa", count: count("active") },
            { value: "retired", label: "Aposentados", count: count("retired") },
            { value: "dead", label: "Mortos", count: count("dead") },
          ]}
        />
      </div>

      <p className="text-sm text-fg-subtle" aria-live="polite">
        {visible.length === all.length
          ? `${all.length} ${all.length === 1 ? "Corvo registrado" : "Corvos registrados"}.`
          : `${visible.length} de ${all.length} Corvos correspondem à consulta.`}
      </p>

      {visible.length === 0 ? (
        <FeedbackState
          title="Nenhum Corvo corresponde à consulta"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
                setFilter("todos");
              }}
            >
              Limpar busca e filtros
            </Button>
          }
        >
          Ajuste a busca ou escolha outra situação.
        </FeedbackState>
      ) : (
        <motion.ul
          className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerList}
          initial="hidden"
          animate="visible"
        >
          {visible.map((raven) => (
            <motion.li key={raven.id} variants={listItem}>
              <RavenCard raven={raven} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function RavenCard({ raven }: Readonly<{ raven: RavenSummary }>) {
  const identity = identityLine(raven);
  return (
    <Link
      href={`/corvos/${raven.id}`}
      className="group block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
    >
      <Card
        interactive
        className="flex h-full flex-col gap-3 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0"
      >
        <RavenPortrait
          name={raven.name}
          src={raven.imageUrl}
          className="-mx-6 -mt-6 mb-1 aspect-[4/3] w-[calc(100%+3rem)] max-w-none rounded-t-lg"
        />
        {raven.status !== "active" ? (
          <div>
            <Badge tone={ravenStatusTone[raven.status]}>{ravenStatusLabels[raven.status]}</Badge>
          </div>
        ) : null}
        <div className="min-w-0 space-y-1">
          <h3 className="font-display text-2xl leading-tight break-words group-hover:text-accent">{raven.name}</h3>
          {raven.playerName ? <p className="text-sm text-fg-muted">Jogador: {raven.playerName}</p> : null}
        </div>
        {identity ? <p className="text-sm text-fg-muted">{identity}</p> : null}
        <dl className="mt-auto flex flex-wrap gap-x-6 gap-y-1 border-t border-line-soft pt-3 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Concluídas</dt>
            <dd className="font-semibold tabular-nums">{raven.missionsCompleted}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Fracassadas</dt>
            <dd className="font-semibold tabular-nums">{raven.missionsFailed}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Sessões</dt>
            <dd className="font-semibold tabular-nums">{raven.sessionsPlayed}</dd>
          </div>
        </dl>
      </Card>
    </Link>
  );
}
