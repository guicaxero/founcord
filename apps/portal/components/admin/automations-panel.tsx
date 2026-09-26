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
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, FormGrid, Input, Textarea } from "@/components/ui/field";
import { softTransition } from "@/components/ui/motion";
import { Notice } from "@/components/ui/notice";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { DetailList, PanelHeader, PanelLoading, PermissionNote, Stats } from "./kit";

const kindContent: Readonly<Record<AutomationKind, Readonly<{ label: string; description: string }>>> = {
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

const statusContent: Readonly<
  Record<AutomationJob["status"], Readonly<{ label: string; description: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }>>
> = {
  queued: { label: "Na fila", description: "Aguardando capacidade de processamento.", tone: "neutral" },
  processing: { label: "Gerando", description: "O registro está virando rascunho.", tone: "info" },
  awaiting_review: { label: "Revisão humana", description: "Rascunho criado na mesa de revisão.", tone: "warning" },
  failed: { label: "Falhou", description: "O registro foi preservado e pode ser reenviado.", tone: "danger" },
  cancelled: { label: "Cancelada", description: "Nenhum rascunho foi criado.", tone: "neutral" },
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
  const toast = useToast();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [composing, setComposing] = useState(false);
  const jobs = useQuery({
    queryKey: queryKeys.automations(campaignId),
    queryFn: () => apiFetch<AutomationJobListResponse>(`/api/campaigns/${campaignId}/automations`),
    refetchInterval: (query) =>
      query.state.data?.data.some((job) => job.status === "queued" || job.status === "processing") ? 3_000 : false,
  });
  const create = useMutation({
    mutationFn: (input: CreateAutomationJobInput) =>
      apiFetch<AutomationJobCreateResponse>(`/api/campaigns/${campaignId}/automations`, {
        method: "POST",
        headers: { "idempotency-key": `portal-ui:${crypto.randomUUID()}` },
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setComposing(false);
      toast({ title: "Registro enviado à fila", description: "A fila se atualiza sozinha enquanto o rascunho é gerado." });
      await queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) });
    },
  });
  const retry = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<AutomationJob>(`/api/campaigns/${campaignId}/automations/${jobId}/retry`, { method: "POST" }),
    onSuccess: async () => {
      toast({ title: "Processamento reenviado", tone: "info" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) });
    },
    onError: (error) => toast({ title: "Não foi possível reenviar", description: errorMessage(error), tone: "danger" }),
  });
  const cancel = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<void>(`/api/campaigns/${campaignId}/automations/${jobId}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast({ title: "Processamento cancelado", tone: "info" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) });
    },
    onError: (error) => toast({ title: "Não foi possível cancelar", description: errorMessage(error), tone: "danger" }),
  });
  const canRun = hasCapability(me, "automation:run", campaignId);

  async function openReview(target: AutomationJob["target"]["type"]) {
    await queryClient.invalidateQueries({
      queryKey:
        target === "session_summary"
          ? queryKeys.sessionSummaries(campaignId, "editorial")
          : queryKeys.posts(campaignId, "editorial"),
    });
    onOpenReview(target);
  }

  if (jobs.isPending) return <PanelLoading label="Consultando a fila de automações" />;
  if (jobs.isError) {
    return (
      <FeedbackState
        title="As automações estão indisponíveis"
        tone="error"
        role="alert"
        action={<Button onClick={() => jobs.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(jobs.error)}
      </FeedbackState>
    );
  }

  const data = jobs.data.data;
  const quota = jobs.data.quota;
  const quotaExhausted = quota.remainingToday === 0;
  const active = data.filter((job) => job.status === "queued" || job.status === "processing").length;
  const awaitingReview = data.filter((job) => job.status === "awaiting_review").length;

  return (
    <div className="space-y-8">
      <Stats
        label="Resumo da fila"
        items={[
          { label: "Gerações restantes hoje", value: quota.remainingToday, hint: `${quota.usedToday} de ${quota.dailyJobLimit} usadas` },
          { label: "Em andamento", value: active },
          { label: "Na revisão", value: awaitingReview },
        ]}
      />

      <Notice tone="info" title="Registros viram rascunhos, nunca publicações">
        Toda saída chega à mesa de revisão, e só uma pessoa autorizada pode aprovar e publicar. A IA não recebe
        permissão para aprovar nem publicar.
      </Notice>

      {quotaExhausted ? (
        <Notice tone="warning" role="status">
          A cota gratuita de hoje terminou. Novas gerações ficam disponíveis amanhã.
        </Notice>
      ) : null}

      <section className="space-y-5" aria-labelledby="automation-history-title">
        <PanelHeader
          id="automation-history-title"
          eyebrow="Histórico recente"
          title="Fila editorial"
          actions={
            <>
              <Button size="sm" onClick={() => jobs.refetch()} disabled={jobs.isFetching}>
                {jobs.isFetching ? "Atualizando…" : "Atualizar fila"}
              </Button>
              {canRun ? (
                <Button
                  ref={triggerRef}
                  variant="accent"
                  size="sm"
                  disabled={quotaExhausted}
                  onClick={() => {
                    create.reset();
                    setComposing(true);
                  }}
                >
                  Novo processamento
                </Button>
              ) : null}
            </>
          }
        />
        {!canRun ? <PermissionNote>Seu perfil acompanha os rascunhos, mas não inicia novas automações.</PermissionNote> : null}

        {data.length === 0 ? (
          <FeedbackState
            title="Nenhum registro processado"
            action={canRun && !quotaExhausted ? <Button variant="accent" onClick={() => setComposing(true)}>Preparar um registro</Button> : null}
          >
            Envie as anotações de uma sessão. O resultado aparece aqui e segue para revisão.
          </FeedbackState>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            <AnimatePresence initial={false}>
              {data.map((job) => {
                const status = statusContent[job.status];
                return (
                  <motion.li key={job.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={softTransition}>
                    <Card className="flex h-full flex-col gap-4">
                      <header className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={status.tone}>
                              {job.status === "processing" ? (
                                <span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" aria-hidden="true" />
                              ) : null}
                              {status.label}
                            </Badge>
                            <time className="text-xs text-fg-subtle" dateTime={job.createdAt}>{formatDateTime(job.createdAt)}</time>
                          </div>
                          <h3 className="font-display text-lg leading-tight break-words">
                            {job.suggestedTitle || kindContent[job.kind].label}
                          </h3>
                          <p className="text-sm text-fg-muted">{status.description}</p>
                        </div>
                      </header>
                      <DetailList
                        items={[
                          { label: "Tipo", value: kindContent[job.kind].label },
                          { label: "Solicitado por", value: job.requestedByName },
                          { label: "Tentativas", value: `${job.attempts} de ${job.maxAttempts}` },
                        ]}
                      />
                      {job.sourcePreview ? (
                        <blockquote className="line-clamp-3 border-l-2 border-line-strong pl-3 text-sm text-fg-muted italic">
                          {job.sourcePreview}
                        </blockquote>
                      ) : null}
                      {job.errorMessage ? <Notice tone="danger">{job.errorMessage}</Notice> : null}
                      {job.status === "awaiting_review" || ((job.status === "failed" || job.status === "queued") && canRun) ? (
                        <footer className="mt-auto flex flex-wrap gap-2 border-t border-line-soft pt-4">
                          {job.status === "awaiting_review" ? (
                            <Button size="sm" variant="primary" onClick={() => openReview(job.target.type)}>
                              Abrir mesa de revisão
                            </Button>
                          ) : null}
                          {job.status === "failed" && canRun ? (
                            <Button size="sm" disabled={retry.isPending || quotaExhausted} onClick={() => retry.mutate(job.id)}>
                              Tentar novamente
                            </Button>
                          ) : null}
                          {(job.status === "queued" || job.status === "failed") && canRun ? (
                            <Button size="sm" variant="ghost" className="text-danger" disabled={cancel.isPending} onClick={() => cancel.mutate(job.id)}>
                              Cancelar
                            </Button>
                          ) : null}
                        </footer>
                      ) : null}
                    </Card>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {canRun ? (
        <Dialog
          open={composing}
          onOpenChange={(next) => {
            if (!next && !create.isPending) setComposing(false);
          }}
          title="Preparar um registro"
          description="Use anotações ou uma transcrição revisável, sem dados secretos."
          returnFocusRef={triggerRef}
          className="max-w-3xl"
        >
          <AutomationForm
            campaignId={campaignId}
            busy={create.isPending}
            error={create.isError ? errorMessage(create.error) : null}
            onCancel={() => setComposing(false)}
            onSubmit={(input) => create.mutate(input)}
          />
        </Dialog>
      ) : null}
    </div>
  );
}

function AutomationForm({
  campaignId,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  campaignId: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: CreateAutomationJobInput) => void;
}>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const suggestedTitle = String(form.get("suggestedTitle") ?? "").trim();
    const instructions = String(form.get("instructions") ?? "").trim();
    onSubmit({
      campaignId,
      kind: "chronicle_draft",
      source: {
        kind: "pasted_text",
        label: String(form.get("sourceLabel")),
        content: String(form.get("sourceContent")),
      },
      ...(suggestedTitle ? { suggestedTitle } : {}),
      ...(instructions ? { instructions } : {}),
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <FormGrid>
        <Notice className="full" tone="info" title="Rascunho de crônica, para Crônicas">
          A automação transforma o registro numa narrativa da lore, que vai para revisão em Crônicas. Resumos de
          sessão são gerados pela área Sessões e vão para o Diário.
        </Notice>
        <Field label="Nome do registro">
          {({ id }) => <Input id={id} name="sourceLabel" required minLength={3} maxLength={120} placeholder="Ex.: Sessão 12 — O moinho" />}
        </Field>
        <Field label="Título sugerido" optional className="full">
          {({ id }) => <Input id={id} name="suggestedTitle" minLength={3} maxLength={140} placeholder="A revisão poderá alterar este título" />}
        </Field>
        <Field label="Registro da sessão" className="full" hint="Mínimo de 100 caracteres. O material bruto é removido após 30 dias.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              name="sourceContent"
              required
              minLength={100}
              maxLength={40_000}
              rows={12}
              placeholder="Cole aqui anotações, transcrição ou diário bruto da sessão…"
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field label="Orientação editorial" optional className="full">
          {({ id }) => (
            <Textarea id={id} name="instructions" minLength={3} maxLength={2_000} rows={3} placeholder="Ex.: destaque as consequências políticas" />
          )}
        </Field>
      </FormGrid>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Enviando para a fila…" : "Gerar rascunho para revisão"}
        </Button>
      </div>
    </form>
  );
}
