"use client";

import { useQuery } from "@tanstack/react-query";
import {
  mediaUrl,
  type MissionListResponse,
  type MissionOutcome,
  type MissionSummary,
} from "@ordem/contracts";
import { motion } from "motion/react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { plainText } from "@/components/editorial/rich-text";
import { Button, ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { listItem, staggerList } from "@/components/ui/motion";
import { Badge, Card, Skeleton } from "@/components/ui/surface";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { excerpt, formatDate, normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { missionNumberLabel, outcomeLabels, outcomeTone } from "./mission-presentation";

type Filter = "todas" | MissionOutcome;

type RecordedMission = MissionSummary & { outcome: MissionOutcome };

function isRecorded(mission: MissionSummary): mission is RecordedMission {
  return mission.outcome !== null;
}

/** Número decrescente; sem número, pela data do registro. */
function byRegistryOrder(left: RecordedMission, right: RecordedMission): number {
  if (left.number !== null && right.number !== null) return right.number - left.number;
  if (left.number !== null) return -1;
  if (right.number !== null) return 1;
  return (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "");
}

/** Arquivo público das missões que já partiram. */
export function MissionRegistry({ campaignId }: Readonly<{ campaignId: string }>) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const missions = useQuery({
    queryKey: queryKeys.missions(campaignId),
    queryFn: () => apiFetch<MissionListResponse>(`/api/campaigns/${campaignId}/missions`),
  });

  const recorded = useMemo(
    () => (missions.data?.data ?? []).filter(isRecorded).sort(byRegistryOrder),
    [missions.data],
  );
  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    return recorded.filter((mission) => {
      if (filter !== "todas" && mission.outcome !== filter) return false;
      if (!term) return true;
      const haystack = [
        missionNumberLabel(mission.number),
        mission.number === null ? "" : String(mission.number).padStart(3, "0"),
        mission.title,
        mission.region,
        mission.summary,
        plainText(mission.report),
      ].join(" ");
      return normalizeSearch(haystack).includes(term);
    });
  }, [filter, recorded, search]);

  if (missions.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Consultando o registro">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  if (missions.isError) {
    return (
      <FeedbackState
        title="Não foi possível consultar o registro"
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

  if (recorded.length === 0) {
    return (
      <FeedbackState
        title="Nenhuma missão no registro ainda"
        action={<ButtonLink href="/missoes">Ver chamados abertos</ButtonLink>}
      >
        Quando uma missão parte, termina ou fracassa, o mestre a registra aqui com o relato da
        aventura.
      </FeedbackState>
    );
  }

  const count = (outcome: MissionOutcome) =>
    recorded.filter((mission) => mission.outcome === outcome).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1 space-y-2">
          <label className="block text-sm font-semibold text-fg-muted" htmlFor={searchId}>
            Buscar no registro
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número, nome, região ou trecho do relato"
            autoComplete="off"
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </div>
        <FilterChips
          label="Filtrar o registro por situação"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todas", label: "Todas", count: recorded.length },
            { value: "in_progress", label: "Em andamento", count: count("in_progress") },
            { value: "completed", label: "Concluídas", count: count("completed") },
            { value: "failed", label: "Fracassadas", count: count("failed") },
          ]}
        />
      </div>

      <p className="text-sm text-fg-subtle" aria-live="polite">
        {visible.length === recorded.length
          ? `${recorded.length} ${recorded.length === 1 ? "missão registrada" : "missões registradas"}.`
          : `${visible.length} de ${recorded.length} missões correspondem à consulta.`}
      </p>

      {visible.length === 0 ? (
        <FeedbackState
          title="Nenhuma missão corresponde à consulta"
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
          Ajuste a busca ou escolha outra situação.
        </FeedbackState>
      ) : (
        <motion.ul
          className="grid list-none gap-4 p-0 sm:grid-cols-2"
          variants={staggerList}
          initial="hidden"
          animate="visible"
        >
          {visible.map((mission) => (
            <motion.li key={mission.id} variants={listItem}>
              <RegistryCard mission={mission} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function RegistryCard({ mission }: Readonly<{ mission: RecordedMission }>) {
  const label = missionNumberLabel(mission.number);
  const text = plainText(mission.report) || mission.summary;
  return (
    <Link
      href={`/missoes/${mission.id}`}
      className="group block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
    >
      <Card
        interactive
        className="flex h-full flex-col gap-3 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0"
      >
        {mission.coverMediaId ? (
          // Capa enviada ao portal: next/image não se aplica ao armazenamento próprio.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(mission.coverMediaId)}
            alt=""
            loading="lazy"
            className="-mx-6 -mt-6 mb-1 aspect-[21/9] w-[calc(100%+3rem)] max-w-none rounded-t-lg object-cover"
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={outcomeTone[mission.outcome]}>{outcomeLabels[mission.outcome]}</Badge>
          <Badge>{mission.region}</Badge>
        </div>
        <div className="space-y-1">
          {label ? (
            <p className="text-xs font-bold tracking-[0.12em] text-fg-subtle uppercase">{label}</p>
          ) : null}
          <h3 className="font-display text-xl leading-tight group-hover:text-accent">
            {mission.title}
          </h3>
        </div>
        <p className="text-sm text-fg-muted text-pretty">{excerpt(text)}</p>
        <p className="mt-auto flex flex-wrap justify-between gap-2 pt-2 text-xs text-fg-subtle">
          <span>Registrada em {formatDate(mission.recordedAt, "data não informada")}</span>
          <span aria-hidden="true" className="font-semibold text-accent">
            Ler o registro →
          </span>
        </p>
      </Card>
    </Link>
  );
}
