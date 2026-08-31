"use client";

import { useQuery } from "@tanstack/react-query";
import type { SessionSummary, SessionSummaryListResponse } from "@vigilia/contracts";
import { FeedbackState } from "@/components/ui/feedback-state";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function SessionSummaries({
  campaignId,
  initialSummaries,
}: Readonly<{ campaignId: string; initialSummaries: SessionSummary[] }>) {
  const summaries = useQuery({
    queryKey: queryKeys.sessionSummaries(campaignId),
    queryFn: () => apiFetch<SessionSummaryListResponse>(`/api/campaigns/${campaignId}/session-summaries`),
    initialData: { data: initialSummaries },
    initialDataUpdatedAt: 0,
  });

  return (
    <section className="session-diary" id="diario">
      <div className="section-heading">
        <div><p className="section-index">05 / DIÁRIO</p><h2>Diário de Sessões</h2></div>
      </div>
      <p className="session-diary-intro">Registros do que a Ordem viveu em cada expedição.</p>
      <div className="session-diary-grid">
        {summaries.isError ? (
          <FeedbackState title="O diário não pôde ser consultado" tone="error" role="alert" action={(
            <button className="secondary-action" type="button" onClick={() => summaries.refetch()}>Tentar novamente</button>
          )}>{errorMessage(summaries.error)}</FeedbackState>
        ) : summaries.isFetching && summaries.data.data.length === 0 ? (
          <FeedbackState title="Consultando o diário" role="status">Estamos buscando os registros publicados pela Ordem.</FeedbackState>
        ) : summaries.data.data.length === 0 ? (
          <FeedbackState title="Nenhum registro publicado">Os resumos aprovados aparecerão aqui após a revisão.</FeedbackState>
        ) : summaries.data.data.map((summary) => <SummaryCard key={summary.id} summary={summary} />)}
      </div>
    </section>
  );
}

function SummaryCard({ summary }: Readonly<{ summary: SessionSummary }>) {
  return (
    <article className="session-diary-card">
      <span>{formatDate(summary.publishedAt)}{summary.sessionTitle ? ` · ${summary.sessionTitle}` : ""}</span>
      <h3>{summary.title}</h3>
      {summary.mission ? <p className="session-diary-mission">Missão: {summary.mission.title}</p> : null}
      <p>{firstParagraph(summary.body)}</p>
      <details>
        <summary>Ler registro completo</summary>
        <div className="chronicle-body">
          {summary.body.split(/\n\s*\n/).map((paragraph, index) => <p key={`${summary.id}-${index}`}>{paragraph}</p>)}
        </div>
      </details>
    </article>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "data não informada";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function firstParagraph(body: string): string { return body.split(/\n\s*\n/, 1)[0] ?? body; }
