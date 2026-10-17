"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  CurrentUserResponse,
  SessionSummary,
  SessionSummaryListResponse,
} from "@ordem/contracts";
import { motion } from "motion/react";
import { ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Notice } from "@/components/ui/notice";
import { riseIn } from "@/components/ui/motion";
import { Badge, PageHeader, Skeleton } from "@/components/ui/surface";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { ArticleBody, EditorialList, type EditorialEntry } from "./editorial-list";

function toEntry(summary: SessionSummary): EditorialEntry {
  return {
    id: summary.id,
    title: summary.title,
    body: summary.body,
    authorName: summary.authorName,
    publishedAt: summary.publishedAt,
    tags: [summary.sessionTitle, summary.mission?.title].filter(
      (tag): tag is string => Boolean(tag),
    ),
  };
}

/** O Diário está fechado aos jogadores e a pessoa não faz parte da gestão. */
export function isDiaryRestricted(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === "diary_restricted";
}

export function DiaryRestricted() {
  return (
    <FeedbackState
      title="O Diário está fechado por enquanto"
      action={<ButtonLink href="/cronicas">Ler as crônicas</ButtonLink>}
    >
      O mestre está testando os registros das sessões antes de abri-los aos Corvos. Enquanto isso,
      as crônicas da Ordem continuam abertas.
    </FeedbackState>
  );
}

/** Para a gestão: lembra que os jogadores não veem o Diário enquanto ele está fechado. */
export function DiaryClosedNotice({ campaignId }: Readonly<{ campaignId: string }>) {
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
    staleTime: 60_000,
  });
  if (!me.data?.diary.visible || me.data.diary.openToPlayers) return null;
  return (
    <Notice
      title="Só a gestão vê o Diário"
      action={
        hasCapability(me.data, "campaign:manage", campaignId) ? (
          <ButtonLink href="/dashboard/configuracoes" variant="secondary" size="sm">
            Abrir aos jogadores
          </ButtonLink>
        ) : undefined
      }
    >
      Os jogadores não encontram o Diário no menu nem na página inicial. Ele abre pela opção
      &quot;Diário de Sessões aberto aos jogadores&quot;, nas configurações da campanha.
    </Notice>
  );
}

export function SessionDiary({
  campaignId,
  limit,
}: Readonly<{ campaignId: string; limit?: number | undefined }>) {
  const summaries = useQuery({
    queryKey: queryKeys.sessionSummaries(campaignId),
    queryFn: () =>
      apiFetch<SessionSummaryListResponse>(`/api/campaigns/${campaignId}/session-summaries`),
    retry: (count, error) => !isDiaryRestricted(error) && count < 3,
  });

  if (summaries.isError && isDiaryRestricted(summaries.error)) {
    return <DiaryRestricted />;
  }

  return (
    <EditorialList
      entries={(summaries.data?.data ?? []).map(toEntry)}
      basePath="/diario"
      searchLabel="Buscar registro"
      searchPlaceholder="Título, sessão ou trecho"
      isPending={summaries.isPending}
      error={summaries.isError ? errorMessage(summaries.error) : null}
      onRetry={() => summaries.refetch()}
      emptyTitle="Nenhum registro publicado"
      emptyDescription="Os resumos das sessões aparecem aqui depois da revisão humana."
      limit={limit}
    />
  );
}

export function DiaryEntryDetail({
  summaryId,
  campaignId,
}: Readonly<{ summaryId: string; campaignId: string }>) {
  const summary = useQuery({
    queryKey: ["session-summaries", summaryId],
    queryFn: () =>
      apiFetch<SessionSummary>(`/api/campaigns/${campaignId}/session-summaries/${summaryId}`),
    retry: (count, error) => !isDiaryRestricted(error) && count < 3,
  });

  if (summary.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="Abrindo o registro">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (summary.isError && isDiaryRestricted(summary.error)) {
    return <DiaryRestricted />;
  }

  if (summary.isError) {
    const notFound = summary.error instanceof ApiClientError && summary.error.status === 404;
    return (
      <FeedbackState
        title={notFound ? "Registro não encontrado" : "Não foi possível abrir o registro"}
        tone={notFound ? "neutral" : "error"}
        role={notFound ? undefined : "alert"}
        action={<ButtonLink href="/diario">Voltar ao diário</ButtonLink>}
      >
        {notFound
          ? "Ele pode ter sido arquivado ou ainda não foi publicado."
          : errorMessage(summary.error)}
      </FeedbackState>
    );
  }

  const data = summary.data;

  return (
    <motion.article className="space-y-8" variants={riseIn} initial="hidden" animate="visible">
      <div className="space-y-4">
        <ButtonLink variant="link" href="/diario">
          ← Voltar ao diário
        </ButtonLink>
        <PageHeader
          eyebrow="Diário de sessões"
          title={data.title}
          description={`Por ${data.authorName} · ${formatDate(data.publishedAt, "Sem data")}`}
        />
        <div className="flex flex-wrap gap-2">
          {data.sessionTitle ? <Badge>{data.sessionTitle}</Badge> : null}
          {data.mission ? (
            <ButtonLink variant="link" href={`/missoes/${data.mission.id}`}>
              Missão: {data.mission.title}
            </ButtonLink>
          ) : null}
        </div>
      </div>
      <ArticleBody body={data.body} />
    </motion.article>
  );
}
