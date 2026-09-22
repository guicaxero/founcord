"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutomationJob,
  AutomationJobCreateResponse,
  AutomationJobListResponse,
  AutomationKind,
  CreateAutomationJobInput,
  CurrentUserResponse,
} from "@ordem/contracts";
import { useRef, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";

const kindContent: Readonly<Record<AutomationKind, Readonly<{
  label: string;
  description: string;
}>>> = {
  session_summary: {
    label: "Resumo de sessão",
    description: "Organiza acontecimentos, decisões, consequências e pendências.",
  },
  chronicle_draft: {
    label: "Rascunho de crônica",
    description: "Converte o registro em uma narrativa editorial sem inventar fatos.",
  },
  record_extraction: {
    label: "Extrair registros",
    description: "Separa personagens, locais, recompensas, perdas e novos ganchos.",
  },
};

const statusContent: Readonly<Record<AutomationJob["status"], Readonly<{
  label: string;
  description: string;
}>>> = {
  queued: { label: "Na fila", description: "Aguardando capacidade de processamento." },
  processing: { label: "Gerando", description: "O registro está sendo transformado em rascunho." },
  awaiting_review: { label: "Revisão humana", description: "Rascunho criado na mesa de publicações." },
  failed: { label: "Falhou", description: "O registro foi preservado e pode ser reenviado." },
  cancelled: { label: "Cancelada", description: "Nenhum rascunho foi criado." },
};

export function AutomationsPanel({
  campaignId,
  me,
  onOpenReview,
}: Readonly<{
  campaignId: string;
  me: CurrentUserResponse;
  onOpenReview: (target: AutomationJob["target"]["type"]) => void;
}>) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const jobs = useQuery({
    queryKey: queryKeys.automations(campaignId),
    queryFn: () =>
      apiFetch<AutomationJobListResponse>(
        `/api/campaigns/${campaignId}/automations`,
      ),
    refetchInterval: (query) =>
      query.state.data?.data.some((job) =>
        job.status === "queued" || job.status === "processing",
      )
        ? 3_000
        : false,
  });
  const create = useMutation({
    mutationFn: (input: CreateAutomationJobInput) =>
      apiFetch<AutomationJobCreateResponse>(
        `/api/campaigns/${campaignId}/automations`,
        {
          method: "POST",
          headers: { "idempotency-key": `portal-ui:${crypto.randomUUID()}` },
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async () => {
      formRef.current?.reset();
      await queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) });
    },
  });
  const retry = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<AutomationJob>(
        `/api/campaigns/${campaignId}/automations/${jobId}/retry`,
        { method: "POST" },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) }),
  });
  const cancel = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<void>(`/api/campaigns/${campaignId}/automations/${jobId}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) }),
  });
  const canRun = hasCapability(me, "automation:run", campaignId);
  const data = jobs.data?.data ?? [];
  const active = data.filter((job) => job.status === "queued" || job.status === "processing").length;
  const awaitingReview = data.filter((job) => job.status === "awaiting_review").length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const suggestedTitle = String(form.get("suggestedTitle") ?? "").trim();
    const instructions = String(form.get("instructions") ?? "").trim();
    create.mutate({
      campaignId,
      kind: String(form.get("kind")) as AutomationKind,
      source: {
        kind: "pasted_text",
        label: String(form.get("sourceLabel")),
        content: String(form.get("sourceContent")),
      },
      ...(suggestedTitle ? { suggestedTitle } : {}),
      ...(instructions ? { instructions } : {}),
    });
  }

  async function openReview(target: AutomationJob["target"]["type"]) {
    await queryClient.invalidateQueries({
      queryKey: target === "session_summary"
        ? queryKeys.sessionSummaries(campaignId, "editorial")
        : queryKeys.posts(campaignId, "editorial"),
    });
    onOpenReview(target);
  }

  if (jobs.isLoading) {
    return (
      <div className="automation-loading" aria-live="polite">
        <span className="loading-line" aria-hidden="true" />
        <p>Consultando a fila de automações…</p>
      </div>
    );
  }
  if (jobs.isError) {
    return (
      <section className="admin-card foundry-query-state">
        <span className="automation-state-mark" aria-hidden="true">✦</span>
        <h2>As automações estão indisponíveis</h2>
        <p>{errorMessage(jobs.error)}</p>
        <button className="admin-primary" type="button" onClick={() => jobs.refetch()}>
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <div className="automation-panel">
      <section className="automation-overview" aria-labelledby="automation-title">
        <div>
          <span className="admin-eyebrow">Oficina editorial</span>
          <h2 id="automation-title">Registros viram rascunhos, nunca publicações</h2>
          <p>
            A automação organiza o material enviado. Toda saída chega à mesa de revisão
            e só uma pessoa autorizada pode aprovar e publicar.
          </p>
        </div>
        <div className="automation-quota" aria-label="Cota diária de automações">
          <strong>{jobs.data?.quota.remainingToday ?? 0}</strong>
          <span>gerações restantes hoje</span>
          <small>{jobs.data?.quota.usedToday ?? 0} de {jobs.data?.quota.dailyJobLimit} utilizadas</small>
        </div>
      </section>

      <section className="automation-metrics" aria-label="Resumo da fila">
        <article><strong>{active}</strong><span>Em andamento</span></article>
        <article><strong>{awaitingReview}</strong><span>Na revisão</span></article>
        <article><strong>{data.length}</strong><span>Registros recentes</span></article>
      </section>

      <div className="automation-layout">
        <section aria-labelledby="automation-history-title">
          <div className="admin-section-title automation-list-heading">
            <div>
              <span>Histórico recente</span>
              <h2 id="automation-history-title">Fila editorial</h2>
            </div>
            <button className="secondary-action" type="button" onClick={() => jobs.refetch()}>
              Atualizar fila
            </button>
          </div>
          {data.length === 0 ? (
            <div className="automation-empty">
              <span aria-hidden="true">✦</span>
              <h3>Nenhum registro processado</h3>
              <p>
                Cole abaixo as anotações de uma sessão. O primeiro resultado aparecerá
                aqui e seguirá para revisão.
              </p>
            </div>
          ) : (
            <div className="automation-job-list">
              {data.map((job) => {
                const status = statusContent[job.status];
                return (
                  <article className="automation-job" key={job.id}>
                    <header>
                      <div>
                        <span className={`automation-status is-${job.status}`}>
                          {status.label}
                        </span>
                        <h3>{job.suggestedTitle || kindContent[job.kind].label}</h3>
                        <p>{status.description}</p>
                      </div>
                      <time dateTime={job.createdAt}>
                        {new Intl.DateTimeFormat("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(job.createdAt))}
                      </time>
                    </header>
                    <div className="automation-job-body">
                      <dl>
                        <div><dt>Tipo</dt><dd>{kindContent[job.kind].label}</dd></div>
                        <div><dt>Solicitado por</dt><dd>{job.requestedByName}</dd></div>
                        <div><dt>Tentativas</dt><dd>{job.attempts} de {job.maxAttempts}</dd></div>
                      </dl>
                      {job.sourcePreview ? <p className="automation-source-preview">“{job.sourcePreview}”</p> : null}
                      {job.errorMessage ? <p className="inline-error">{job.errorMessage}</p> : null}
                    </div>
                    <footer>
                      {job.status === "awaiting_review" ? (
                        <button className="admin-primary" type="button" onClick={() => openReview(job.target.type)}>
                          Abrir mesa de revisão
                        </button>
                      ) : null}
                      {job.status === "failed" && canRun ? (
                        <button
                          className="secondary-action"
                          type="button"
                          disabled={retry.isPending || (jobs.data?.quota.remainingToday ?? 0) === 0}
                          onClick={() => retry.mutate(job.id)}
                        >
                          Tentar novamente
                        </button>
                      ) : null}
                      {(job.status === "queued" || job.status === "failed") && canRun ? (
                        <button
                          className="danger-link"
                          type="button"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate(job.id)}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
          {retry.isError ? <p className="inline-error">{errorMessage(retry.error)}</p> : null}
          {cancel.isError ? <p className="inline-error">{errorMessage(cancel.error)}</p> : null}
        </section>

        {canRun ? (
          <aside className="automation-editor" aria-labelledby="automation-form-title">
            <div className="admin-section-title">
              <div>
                <span>Novo processamento</span>
                <h2 id="automation-form-title">Preparar um registro</h2>
                <p>Use anotações ou uma transcrição revisável, sem dados secretos.</p>
              </div>
            </div>
            <form ref={formRef} className="admin-form" onSubmit={submit}>
              <label className="full">
                Resultado desejado
                <select name="kind" defaultValue="chronicle_draft" required>
                  {Object.entries(kindContent).filter(([value]) => value !== "session_summary").map(([value, content]) => (
                    <option key={value} value={value}>{content.label}</option>
                  ))}
                </select>
                <small>Escolha como o registro será organizado.</small>
              </label>
              <label className="full">
                Nome do registro
                <input name="sourceLabel" required minLength={3} maxLength={120} placeholder="Ex.: Sessão 12 — O moinho" />
              </label>
              <label className="full">
                Título sugerido <span className="optional-field">opcional</span>
                <input name="suggestedTitle" minLength={3} maxLength={140} placeholder="A revisão poderá alterar este título" />
              </label>
              <label className="full">
                Registro da sessão
                <textarea
                  name="sourceContent"
                  required
                  minLength={100}
                  maxLength={40_000}
                  rows={15}
                  placeholder="Cole aqui anotações, transcrição ou diário bruto da sessão…"
                />
                <small>Mínimo de 100 caracteres. O material bruto é removido após 30 dias.</small>
              </label>
              <label className="full">
                Orientação editorial <span className="optional-field">opcional</span>
                <textarea name="instructions" minLength={3} maxLength={2_000} rows={4} placeholder="Ex.: destaque as consequências políticas" />
              </label>
              <button
                className="admin-primary full"
                disabled={create.isPending || (jobs.data?.quota.remainingToday ?? 0) === 0}
              >
                {create.isPending ? "Enviando para a fila…" : "Gerar rascunho para revisão"}
              </button>
            </form>
            {(jobs.data?.quota.remainingToday ?? 0) === 0 ? (
              <p className="inline-warning" role="status">
                A cota gratuita de hoje terminou. Novas gerações estarão disponíveis amanhã.
              </p>
            ) : null}
            {create.isSuccess ? (
              <p className="inline-success" role="status">
                Registro enviado. A fila será atualizada automaticamente.
              </p>
            ) : null}
            {create.isError ? <p className="inline-error">{errorMessage(create.error)}</p> : null}
            <p className="editorial-note">
              A IA não recebe permissão para aprovar ou publicar conteúdo.
            </p>
          </aside>
        ) : (
          <aside className="permission-note">
            Seu perfil acompanha os rascunhos, mas não inicia novas automações.
          </aside>
        )}
      </div>
    </div>
  );
}
