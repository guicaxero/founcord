"use client";

import { useQuery } from "@tanstack/react-query";
import type { SessionSummary, SessionSummaryListResponse } from "@ordem/contracts";
import { motion } from "motion/react";
import { ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { riseIn } from "@/components/ui/motion";
import { Badge, PageHeader, Skeleton } from "@/components/ui/surface";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
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

export function SessionDiary({
  campaignId,
  limit,
}: Readonly<{ campaignId: string; limit?: number | undefined }>) {
  const summaries = useQuery({
    queryKey: queryKeys.sessionSummaries(campaignId),
    queryFn: () =>
      apiFetch<SessionSummaryListResponse>(`/api/campaigns/${campaignId}/session-summaries`),
  });

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
  });

  if (summary.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="Abrindo o registro">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
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
