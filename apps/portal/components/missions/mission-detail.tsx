"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mediaUrl, type CurrentUserResponse, type MissionSummary } from "@ordem/contracts";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { riseIn } from "@/components/ui/motion";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui/surface";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { formatDate, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";
import {
  availabilityOf,
  isSignedUp,
  riskLabels,
  riskTone,
  signupActionLabel,
  signupStatusLabel,
} from "./mission-presentation";

export function MissionDetail({ missionId }: Readonly<{ missionId: string }>) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const mission = useQuery({
    queryKey: ["missions", missionId],
    queryFn: () => apiFetch<MissionSummary>(`/api/missions/${missionId}`),
  });
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
    staleTime: 60_000,
  });
  const signup = useMutation({
    mutationFn: (current: MissionSummary) =>
      apiFetch<{ status: "confirmed" | "waitlisted" }>(`/api/missions/${current.id}/signups`, {
        method: isSignedUp(current) ? "DELETE" : "POST",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["missions", missionId] }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.missions(DEFAULT_CAMPAIGN_ID),
        }),
      ]);
    },
  });

  if (mission.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="Consultando o chamado">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (mission.isError) {
    const notFound = mission.error instanceof ApiClientError && mission.error.status === 404;
    return (
      <FeedbackState
        title={notFound ? "Chamado não encontrado" : "Não foi possível abrir o chamado"}
        tone={notFound ? "neutral" : "error"}
        role={notFound ? undefined : "alert"}
        action={<ButtonLink href="/missoes">Voltar ao quadro</ButtonLink>}
      >
        {notFound
          ? "Ele pode ter sido arquivado ou ainda não foi publicado."
          : errorMessage(mission.error)}
      </FeedbackState>
    );
  }

  const data = mission.data;
  const availability = availabilityOf(data);
  const status = signupStatusLabel(data);
  const relative = formatRelative(data.scheduledFor);

  return (
    <motion.article className="space-y-8" variants={riseIn} initial="hidden" animate="visible">
      <div className="space-y-4">
        <ButtonLink variant="link" href="/missoes">
          ← Voltar ao quadro
        </ButtonLink>
        <PageHeader
          eyebrow={data.region}
          title={data.title}
          description={data.summary}
          actions={
            me.data?.authenticated ? (
              <Button
                variant={isSignedUp(data) ? "secondary" : "accent"}
                size="lg"
                disabled={signup.isPending}
                onClick={() => signup.mutate(data)}
              >
                {signup.isPending ? "Atualizando…" : signupActionLabel(data)}
              </Button>
            ) : (
              <ButtonAnchor
                variant="accent"
                size="lg"
                href={`/api/auth/discord?returnTo=${encodeURIComponent(pathname)}`}
              >
                Entrar para se inscrever
              </ButtonAnchor>
            )
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={availability === "recrutando" ? "success" : "warning"}>
            {availability === "recrutando" ? "Recrutando" : "Lista de espera"}
          </Badge>
          <Badge tone={riskTone[data.risk]}>{riskLabels[data.risk]}</Badge>
          {status ? <Badge tone="accent">{status}</Badge> : null}
        </div>
      </div>

      {data.coverMediaId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(data.coverMediaId)}
          alt={`Capa de ${data.title}`}
          className="aspect-[21/9] w-full rounded-lg border border-line-soft bg-surface-2 object-cover"
        />
      ) : null}

      <Card padding="lg">
        <dl className={`grid gap-6 ${data.estimatedDuration ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
          <div>
            <dt className="text-xs font-semibold text-fg-subtle uppercase">Partida</dt>
            <dd className="mt-1 font-display text-xl">
              {formatDate(data.scheduledFor)}
              {relative ? (
                <span className="block text-sm font-normal text-fg-subtle">{relative}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-subtle uppercase">Companhia</dt>
            <dd className="mt-1 font-display text-xl">
              {data.signupCount} de {data.partySize}
              {data.waitlistCount > 0 ? (
                <span className="block text-sm font-normal text-fg-subtle">
                  +{data.waitlistCount} na lista de espera
                </span>
              ) : null}
            </dd>
          </div>
          {data.estimatedDuration ? (
            <div>
              <dt className="text-xs font-semibold text-fg-subtle uppercase">Duração estimada</dt>
              <dd className="mt-1 font-display text-xl">{data.estimatedDuration}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold text-fg-subtle uppercase">Anunciado por</dt>
            <dd className="mt-1 font-display text-xl">{data.authorName}</dd>
          </div>
        </dl>
      </Card>

      {signup.isError ? (
        <p className="text-sm text-danger" role="alert">
          {errorMessage(signup.error)}
        </p>
      ) : null}

      <p className="text-sm text-fg-subtle">
        A confirmação de presença segue o protocolo do{" "}
        <ButtonLink variant="link" href="/ordem">
          Código da Ordem
        </ButtonLink>
        : avise com antecedência se não puder comparecer.
      </p>
    </motion.article>
  );
}
