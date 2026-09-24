"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentUserResponse,
  MissionListResponse,
  MissionSummary,
} from "@ordem/contracts";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { listItem, staggerList } from "@/components/ui/motion";
import { Badge, Card, Skeleton } from "@/components/ui/surface";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDate, formatRelative, normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import {
  availabilityOf,
  isSignedUp,
  riskLabels,
  riskTone,
  signupActionLabel,
  signupStatusLabel,
} from "./mission-presentation";

type Filter = "todas" | "recrutando" | "lista-de-espera" | "minhas";

const filters: readonly { value: Filter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "recrutando", label: "Recrutando" },
  { value: "lista-de-espera", label: "Lista de espera" },
  { value: "minhas", label: "Minhas inscrições" },
];

export function MissionBoard({
  campaignId,
  limit,
  showFilters = false,
  initialFilter = "todas",
  emptyState,
}: Readonly<{
  campaignId: string;
  /** Usado nos destaques da página inicial. */
  limit?: number | undefined;
  showFilters?: boolean;
  initialFilter?: Filter;
  emptyState?: React.ReactNode;
}>) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter);

  const missions = useQuery({
    queryKey: queryKeys.missions(campaignId),
    queryFn: () => apiFetch<MissionListResponse>(`/api/campaigns/${campaignId}/missions`),
  });
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
    staleTime: 60_000,
  });
  const signup = useMutation({
    mutationFn: (mission: MissionSummary) =>
      apiFetch<{ status: "confirmed" | "waitlisted" }>(`/api/missions/${mission.id}/signups`, {
        method: isSignedUp(mission) ? "DELETE" : "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.missions(campaignId) }),
  });

  const all = useMemo(() => missions.data?.data ?? [], [missions.data]);
  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    const filtered = all.filter((mission) => {
      const matchesFilter =
        filter === "todas" ||
        (filter === "minhas" && isSignedUp(mission)) ||
        (filter !== "minhas" && availabilityOf(mission) === filter);
      const matchesSearch =
        term.length === 0 ||
        normalizeSearch(`${mission.title} ${mission.summary} ${mission.region}`).includes(term);
      return matchesFilter && matchesSearch;
    });
    return limit ? filtered.slice(0, limit) : filtered;
  }, [all, filter, limit, search]);

  if (missions.isPending) {
    return (
      <div className="grid gap-4" role="status" aria-label="Consultando os chamados">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (missions.isError) {
    return (
      <FeedbackState
        title="Não foi possível consultar os chamados"
        tone="error"
        role="alert"
        action={
          <Button variant="secondary" onClick={() => missions.refetch()}>
            Tentar novamente
          </Button>
        }
      >
        {errorMessage(missions.error)}
      </FeedbackState>
    );
  }

  if (all.length === 0) {
    return (
      emptyState ?? (
        <FeedbackState title="Nenhum chamado publicado">
          Novas missões aparecem aqui assim que a Ordem as anuncia.
        </FeedbackState>
      )
    );
  }

  return (
    <div className="space-y-6">
      {showFilters ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1 space-y-2">
            <label className="block text-sm font-semibold text-fg-muted" htmlFor={searchId}>
              Buscar chamado
            </label>
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Título, resumo ou região"
              autoComplete="off"
              className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrar chamados por situação"
          >
            {filters.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={filter === option.value ? "primary" : "secondary"}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {showFilters ? (
        <p className="text-sm text-fg-subtle" aria-live="polite">
          {visible.length === all.length
            ? `${all.length} ${all.length === 1 ? "chamado publicado" : "chamados publicados"}.`
            : `${visible.length} de ${all.length} chamados correspondem à consulta.`}
        </p>
      ) : null}

      {visible.length === 0 && filter === "minhas" && search.trim() === "" ? (
        <FeedbackState
          title="Você ainda não se inscreveu em nenhum chamado"
          action={
            <ButtonLink href="/missoes" variant="accent">
              Ver chamados abertos
            </ButtonLink>
          }
        >
          Quando você confirmar presença ou entrar na lista de espera de uma missão, ela aparece
          aqui.
        </FeedbackState>
      ) : visible.length === 0 ? (
        <FeedbackState
          title="Nenhum chamado corresponde à consulta"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
                setFilter("todas");
              }}
            >
              Limpar busca e filtros
            </Button>
          }
        >
          Ajuste a busca ou escolha outra situação para ver mais chamados.
        </FeedbackState>
      ) : (
        <motion.ul
          className="grid list-none gap-4 p-0"
          variants={staggerList}
          initial="hidden"
          animate="visible"
        >
          {visible.map((mission) => (
            <motion.li key={mission.id} variants={listItem}>
              <MissionCard
                mission={mission}
                authenticated={me.data?.authenticated === true}
                returnTo={pathname}
                pending={signup.isPending && signup.variables?.id === mission.id}
                onToggleSignup={() => signup.mutate(mission)}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}

      {signup.isError ? (
        <p className="text-sm text-danger" role="alert">
          {errorMessage(signup.error)}
        </p>
      ) : null}
    </div>
  );
}

function MissionCard({
  mission,
  authenticated,
  returnTo,
  pending,
  onToggleSignup,
}: Readonly<{
  mission: MissionSummary;
  authenticated: boolean;
  returnTo: string;
  pending: boolean;
  onToggleSignup: () => void;
}>) {
  const availability = availabilityOf(mission);
  const status = signupStatusLabel(mission);
  const relative = formatRelative(mission.scheduledFor);

  return (
    <Card className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start" interactive>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={availability === "recrutando" ? "success" : "warning"}>
            {availability === "recrutando" ? "Recrutando" : "Lista de espera"}
          </Badge>
          <Badge tone={riskTone[mission.risk]}>{riskLabels[mission.risk]}</Badge>
          <Badge>{mission.region}</Badge>
          {status ? <Badge tone="accent">{status}</Badge> : null}
        </div>

        <h3 className="font-display text-2xl leading-tight">
          <Link
            className="rounded-sm hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
            href={`/missoes/${mission.id}`}
          >
            {mission.title}
          </Link>
        </h3>

        <p className="max-w-[70ch] text-fg-muted text-pretty">{mission.summary}</p>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-xs font-semibold text-fg-subtle uppercase">Partida</dt>
            <dd className="font-semibold">
              {formatDate(mission.scheduledFor)}
              {relative ? <span className="ml-1 font-normal text-fg-subtle">({relative})</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-subtle uppercase">Companhia</dt>
            <dd className="font-semibold">
              {mission.signupCount} de {mission.partySize}
              {mission.waitlistCount > 0 ? (
                <span className="ml-1 font-normal text-fg-subtle">
                  (+{mission.waitlistCount} na espera)
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-subtle uppercase">Anunciado por</dt>
            <dd className="font-semibold">{mission.authorName}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-row-reverse flex-wrap items-center gap-2 md:flex-col md:items-stretch">
        {authenticated ? (
          <Button
            variant={isSignedUp(mission) ? "secondary" : "accent"}
            disabled={pending}
            onClick={onToggleSignup}
          >
            {pending ? "Atualizando…" : signupActionLabel(mission)}
          </Button>
        ) : (
          <ButtonAnchor
            variant="accent"
            href={`/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`}
          >
            Entrar para se inscrever
          </ButtonAnchor>
        )}
        <ButtonLink variant="ghost" href={`/missoes/${mission.id}`}>
          Ver detalhes
        </ButtonLink>
      </div>
    </Card>
  );
}
