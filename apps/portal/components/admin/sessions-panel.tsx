"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutomationJob,
  AutomationJobListResponse,
  CampaignSession,
  CampaignSessionCaptureStatus,
  CampaignSessionGenerationResponse,
  CampaignSessionListResponse,
  CampaignSessionOptions,
  CampaignSessionStatus,
  CreateCampaignSessionInput,
  CurrentUserResponse,
  GenerateCampaignSessionDraftInput,
  UpdateCampaignSessionInput,
} from "@ordem/contracts";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { listItem, riseIn, staggerList } from "@/components/ui/motion";
import { Notice } from "@/components/ui/notice";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { DetailList, PanelHeader, PanelLoading } from "./kit";
import type { Tone } from "./status";

const sessionStatusContent: Readonly<
  Record<CampaignSessionStatus, Readonly<{ label: string; description: string; tone: Tone }>>
> = {
  prepared: { label: "Preparada", description: "A sessão foi registrada e ainda não começou.", tone: "neutral" },
  starting: { label: "Iniciando captura", description: "O portal está preparando o registro do Foundry.", tone: "info" },
  active: { label: "Em andamento", description: "A sessão está aberta para receber registros e notas.", tone: "success" },
  ended: { label: "Encerrada", description: "A captura terminou e as fontes podem seguir para revisão.", tone: "neutral" },
  cancelled: { label: "Cancelada", description: "A sessão foi encerrada sem seguir para o fluxo editorial.", tone: "neutral" },
  capture_failed: {
    label: "Captura interrompida",
    description: "Os registros recebidos foram preservados e a captura pode ser retomada.",
    tone: "danger",
  },
};

type HistoryFilter = "all" | "ongoing" | "ended";

export function SessionsPanel({
  campaignId,
  me,
  onOpenReview,
}: Readonly<{
  campaignId: string;
  me: CurrentUserResponse;
  onOpenReview: () => void;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const contextTriggerRef = useRef<HTMLElement | null>(null);
  const endTriggerRef = useRef<HTMLButtonElement>(null);
  const [creating, setCreating] = useState(false);
  const [editingContextId, setEditingContextId] = useState<string | null>(null);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState<CampaignSession | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const canManage = hasCapability(me, "session:manage", campaignId);

  const sessions = useQuery({
    queryKey: queryKeys.campaignSessions(campaignId),
    queryFn: () => apiFetch<CampaignSessionListResponse>(`/api/campaigns/${campaignId}/sessions`),
    refetchInterval: (query) =>
      query.state.data?.data.some((item) => item.status === "active" || item.status === "starting") ? 5_000 : false,
  });
  const options = useQuery({
    queryKey: queryKeys.campaignSessionOptions(campaignId),
    queryFn: () => apiFetch<CampaignSessionOptions>(`/api/campaigns/${campaignId}/sessions/options`),
    enabled: canManage,
    staleTime: 30_000,
  });
  const automations = useQuery({
    queryKey: queryKeys.automations(campaignId),
    queryFn: () => apiFetch<AutomationJobListResponse>(`/api/campaigns/${campaignId}/automations`),
    refetchInterval: (query) =>
      query.state.data?.data.some((job) => job.status === "queued" || job.status === "processing") ? 3_000 : false,
  });

  async function invalidateSessions() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignSessions(campaignId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) }),
    ]);
  }

  const create = useMutation({
    mutationFn: (input: CreateCampaignSessionInput) =>
      apiFetch<CampaignSession>(`/api/campaigns/${campaignId}/sessions`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (created) => {
      setCreating(false);
      setFocusedSessionId(created.id);
      toast({
        title: created.status === "prepared" ? "Sessão registrada" : "Sessão iniciada",
        description: created.title,
      });
      await invalidateSessions();
    },
    onError: invalidateSessions,
  });
  const update = useMutation({
    mutationFn: ({ sessionId, input }: Readonly<{ sessionId: string; input: UpdateCampaignSessionInput }>) =>
      apiFetch<CampaignSession>(`/api/campaigns/${campaignId}/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async (updated) => {
      setEditingContextId(null);
      setFocusedSessionId(updated.id);
      toast({ title: "Fontes da sessão salvas", description: updated.title });
      await invalidateSessions();
    },
  });
  const start = useMutation({
    mutationFn: (item: CampaignSession) =>
      apiFetch<CampaignSession>(`/api/campaigns/${campaignId}/sessions/${item.id}/start`, {
        method: "POST",
        body: JSON.stringify({ version: item.version }),
      }),
    onSuccess: async (started) => {
      setFocusedSessionId(started.id);
      toast({ title: "Captura iniciada", description: started.title, tone: "info" });
      await invalidateSessions();
    },
    onError: invalidateSessions,
  });
  const end = useMutation({
    mutationFn: (item: CampaignSession) =>
      apiFetch<CampaignSession>(`/api/campaigns/${campaignId}/sessions/${item.id}/end`, {
        method: "POST",
        body: JSON.stringify({ version: item.version }),
      }),
    onSuccess: async (ended) => {
      setEndingSession(null);
      setFocusedSessionId(ended.id);
      toast({ title: "Captura encerrada", description: "Revise as fontes e prepare o rascunho quando quiser." });
      await invalidateSessions();
    },
  });
  const generate = useMutation({
    mutationFn: ({ sessionId, input }: Readonly<{ sessionId: string; input: GenerateCampaignSessionDraftInput }>) =>
      apiFetch<CampaignSessionGenerationResponse>(`/api/campaigns/${campaignId}/sessions/${sessionId}/draft`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (result) => {
      setFocusedSessionId(result.session.id);
      toast({ title: "Rascunho solicitado", description: "O resultado chega à mesa de revisão." });
      await Promise.all([
        invalidateSessions(),
        queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) }),
      ]);
    },
  });
  const retry = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<AutomationJob>(`/api/campaigns/${campaignId}/automations/${jobId}/retry`, { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.campaignSessions(campaignId) }),
      ]);
    },
  });

  if (sessions.isPending) return <PanelLoading label="Reunindo as sessões e suas fontes" />;
  if (sessions.isError) return <SessionsQueryError error={sessions.error} onRetry={() => sessions.refetch()} />;

  const data = sessions.data.data;
  const activeSession = data.find(
    (item) => item.status === "active" || item.status === "starting" || item.status === "capture_failed",
  );
  const focusedSession = focusedSessionId ? data.find((item) => item.id === focusedSessionId) ?? null : null;
  const draftSession =
    focusedSession?.status === "ended"
      ? focusedSession
      : !activeSession
        ? data.find((item) => item.status === "ended" && !item.automationJobId) ?? null
        : null;
  const jobsById = new Map((automations.data?.data ?? []).map((job) => [job.id, job] as const));
  const recentSessions = data.filter((item) => item.id !== activeSession?.id);
  const isOngoing = (item: CampaignSession) =>
    item.status === "prepared" || item.status === "starting" || item.status === "active" || item.status === "capture_failed";
  const filteredSessions = recentSessions.filter((item) => {
    if (historyFilter === "all") return true;
    if (historyFilter === "ended") return item.status === "ended" || item.status === "cancelled";
    return isOngoing(item);
  });
  const editingContext = editingContextId ? data.find((item) => item.id === editingContextId) ?? null : null;

  async function openReview() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.sessionSummaries(campaignId, "editorial") });
    onOpenReview();
  }

  function openContext(sessionId: string, trigger: HTMLElement) {
    contextTriggerRef.current = trigger;
    update.reset();
    setEditingContextId(sessionId);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[60ch] text-sm text-fg-muted">
          Registre o ciclo real da mesa, acompanhe o que chegou do Foundry e escolha quais fontes seguem para a
          revisão editorial.
        </p>
        {canManage && !activeSession ? (
          <Button
            ref={createTriggerRef}
            variant="accent"
            onClick={() => {
              create.reset();
              setCreating(true);
            }}
          >
            Registrar sessão
          </Button>
        ) : null}
      </div>

      {data.length === 0 ? (
        <FeedbackState
          title="Nenhuma sessão registrada"
          action={canManage ? <Button variant="accent" onClick={() => setCreating(true)}>Registrar a primeira sessão</Button> : null}
        >
          Registre uma sessão para reunir os acontecimentos do Foundry e as notas da mesa num só lugar.
        </FeedbackState>
      ) : null}

      <AnimatePresence initial={false}>
        {activeSession ? (
          <motion.div key={`active-${activeSession.id}`} variants={riseIn} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <ActiveSessionCard
              item={activeSession}
              canManage={canManage}
              endTriggerRef={endTriggerRef}
              refreshing={sessions.isFetching}
              starting={start.isPending}
              startError={start.isError ? errorMessage(start.error) : null}
              onStart={() => start.mutate(activeSession)}
              onEditContext={(trigger) => openContext(activeSession.id, trigger)}
              onEnd={() => {
                end.reset();
                setEndingSession(activeSession);
              }}
            />
          </motion.div>
        ) : null}
        {draftSession ? (
          <motion.div key={`draft-${draftSession.id}`} variants={riseIn} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <PrepareDraft
              item={draftSession}
              job={draftSession.automationJobId ? jobsById.get(draftSession.automationJobId) ?? null : null}
              quotaRemaining={automations.data?.quota.remainingToday ?? null}
              quotaError={automations.isError ? errorMessage(automations.error) : null}
              busy={generate.isPending}
              retrying={retry.isPending}
              error={generate.isError ? errorMessage(generate.error) : null}
              retryError={retry.isError ? errorMessage(retry.error) : null}
              canManage={canManage}
              onEditContext={(trigger) => openContext(draftSession.id, trigger)}
              onGenerate={(input) => generate.mutate({ sessionId: draftSession.id, input })}
              onRetry={(jobId) => retry.mutate(jobId)}
              onOpenReview={openReview}
              onClose={() => setFocusedSessionId(null)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {recentSessions.length > 0 ? (
        <section className="space-y-5" aria-labelledby="sessions-history-title">
          <PanelHeader
            id="sessions-history-title"
            eyebrow="Registros preservados"
            title="Sessões recentes"
            description="Retome uma sessão preparada ou acompanhe o caminho até a revisão."
          />
          <FilterChips
            label="Filtrar sessões recentes"
            value={historyFilter}
            onChange={setHistoryFilter}
            options={[
              { value: "all", label: "Todas", count: recentSessions.length },
              { value: "ongoing", label: "Em andamento", count: recentSessions.filter(isOngoing).length },
              { value: "ended", label: "Encerradas", count: recentSessions.filter((item) => item.status === "ended" || item.status === "cancelled").length },
            ]}
          />
          {start.isError && !activeSession ? <Notice tone="danger" role="alert">{errorMessage(start.error)}</Notice> : null}
          {filteredSessions.length === 0 ? (
            <FeedbackState title="Nenhuma sessão neste filtro" action={<Button onClick={() => setHistoryFilter("all")}>Mostrar todas</Button>}>
              Escolha outro filtro para ver o histórico.
            </FeedbackState>
          ) : (
            <motion.ul key={historyFilter} className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3" variants={staggerList} initial="hidden" animate="visible">
              {filteredSessions.map((item) => (
                <motion.li key={item.id} variants={listItem}>
                  <SessionHistoryCard
                    item={item}
                    job={item.automationJobId ? jobsById.get(item.automationJobId) ?? null : null}
                    canManage={canManage}
                    starting={start.isPending && start.variables?.id === item.id}
                    onStart={() => start.mutate(item)}
                    onPrepare={() => setFocusedSessionId(item.id)}
                    onOpenReview={openReview}
                  />
                </motion.li>
              ))}
            </motion.ul>
          )}
        </section>
      ) : null}

      {canManage ? (
        <Dialog
          open={creating}
          onOpenChange={(next) => {
            if (!next && !create.isPending) setCreating(false);
          }}
          title="Registrar sessão"
          description="Defina o contexto da mesa e escolha quais fontes estarão disponíveis desde o início."
          returnFocusRef={createTriggerRef}
          className="max-w-3xl"
        >
          <SessionRegistrationForm
            campaignId={campaignId}
            me={me}
            options={options.data}
            optionsLoading={options.isLoading}
            optionsError={options.isError ? errorMessage(options.error) : null}
            busy={create.isPending}
            error={create.isError ? errorMessage(create.error) : null}
            onRetryOptions={() => options.refetch()}
            onCancel={() => setCreating(false)}
            onSubmit={(input) => create.mutate(input)}
          />
        </Dialog>
      ) : null}

      <Dialog
        open={Boolean(editingContext)}
        onOpenChange={(next) => {
          if (!next && !update.isPending) setEditingContextId(null);
        }}
        title={editingContext ? `Fontes manuais de “${editingContext.title}”` : ""}
        description="As alterações ficam salvas na sessão. Nenhum rascunho é gerado sozinho."
        returnFocusRef={contextTriggerRef}
      >
        {editingContext ? (
          <SessionContextForm
            key={editingContext.version}
            item={editingContext}
            busy={update.isPending}
            error={update.isError ? errorMessage(update.error) : null}
            onCancel={() => setEditingContextId(null)}
            onSubmit={(input) => update.mutate({ sessionId: editingContext.id, input })}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(endingSession)}
        title={`Encerrar “${endingSession?.title ?? ""}”?`}
        description="Novos eventos deixam de ser adicionados. As fontes já recebidas ficam preservadas para revisão."
        confirmLabel="Encerrar captura"
        busyLabel="Encerrando captura…"
        cancelLabel="Continuar sessão"
        busy={end.isPending}
        error={end.isError ? `${errorMessage(end.error)} Você pode tentar de novo ou continuar a sessão.` : null}
        onCancel={() => setEndingSession(null)}
        onConfirm={() => endingSession && end.mutate(endingSession)}
        returnFocusRef={endTriggerRef}
      >
        <DetailList
          className="sm:grid-cols-2"
          items={[
            { label: "Mundo afetado", value: endingSession?.foundry?.worldTitle ?? "Nenhum mundo associado" },
            { label: "Registros capturados", value: endingSession?.foundry?.messageCount ?? 0 },
            { label: "Notas do mestre", value: endingSession?.notes.trim() ? "Incluídas" : "Ausentes" },
            { label: "Discord", value: "Mensagens não importadas" },
          ]}
        />
      </ConfirmDialog>
    </div>
  );
}

function SessionRegistrationForm({
  campaignId,
  me,
  options,
  optionsLoading,
  optionsError,
  busy,
  error,
  onRetryOptions,
  onCancel,
  onSubmit,
}: Readonly<{
  campaignId: string;
  me: CurrentUserResponse;
  options: CampaignSessionOptions | undefined;
  optionsLoading: boolean;
  optionsError: string | null;
  busy: boolean;
  error: string | null;
  onRetryOptions: () => void;
  onCancel: () => void;
  onSubmit: (input: CreateCampaignSessionInput) => void;
}>) {
  const blocked = busy || optionsLoading || Boolean(optionsError);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const missionId = String(data.get("missionId") ?? "");
    const worldId = String(data.get("worldId") ?? "");
    const discordReference = String(data.get("discordReference") ?? "").trim();
    onSubmit({
      campaignId,
      title: String(data.get("title")),
      missionId: missionId || null,
      worldId: worldId || null,
      discordReference: discordReference || null,
      notes: String(data.get("notes") ?? ""),
      startNow: submitter instanceof HTMLButtonElement && submitter.value === "start",
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      {optionsLoading ? <p className="text-sm text-fg-subtle" role="status">Carregando missões e mundos disponíveis…</p> : null}
      {optionsError ? (
        <Notice tone="danger" role="alert" action={<Button size="sm" onClick={onRetryOptions}>Tentar novamente</Button>}>
          {optionsError}
        </Notice>
      ) : null}
      {options && !options.foundryAvailable ? (
        <Notice tone="warning" role="status">
          Os mundos do Foundry estão indisponíveis agora. Você pode registrar a sessão só com notas manuais.
        </Notice>
      ) : null}
      <FormGrid>
        <Field label="Nome da sessão" className="full">
          {({ id }) => <Input id={id} name="title" required minLength={3} maxLength={140} placeholder="Ex.: Sessão 12 — O moinho abandonado" disabled={busy} />}
        </Field>
        <Field label="Missão relacionada" optional>
          {({ id }) => (
            <Select id={id} name="missionId" defaultValue="" disabled={busy || Boolean(optionsError)}>
              <option value="">Nenhuma missão relacionada</option>
              {options?.missions.map((mission) => (
                <option value={mission.id} key={mission.id}>{mission.title}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Mestre responsável" hint="O registro fica sob responsabilidade de quem o cria.">
          {({ id, describedBy }) => (
            <Input id={id} value={me.user?.displayName ?? "Mestre atual"} readOnly aria-describedby={describedBy} />
          )}
        </Field>
        <Field
          label="Mundo do Foundry"
          className="full"
          hint={
            options?.foundryAvailable && options.worlds.length === 0
              ? "Nenhum mundo está conectado a esta campanha. A sessão usará notas manuais."
              : "A captura automática começa quando o mestre estiver conectado ao mundo escolhido."
          }
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              name="worldId"
              defaultValue=""
              disabled={busy || Boolean(optionsError) || options?.foundryAvailable === false}
              aria-describedby={describedBy}
            >
              <option value="">Sem mundo — usar só notas manuais</option>
              {options?.worlds.map((world) => (
                <option value={world.worldId} key={world.worldId} disabled={world.status === "revoked"}>
                  {world.worldTitle} — {worldStatusLabel(world.status)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Canal ou tópico do Discord"
          optional
          className="full"
          hint="A referência é salva, mas as mensagens do Discord não são importadas."
        >
          {({ id, describedBy }) => (
            <Input id={id} name="discordReference" maxLength={200} placeholder="Ex.: #sessao-12" disabled={busy} aria-describedby={describedBy} />
          )}
        </Field>
        <Field label="Notas iniciais" optional className="full">
          {({ id }) => (
            <Textarea id={id} name="notes" rows={5} maxLength={20_000} disabled={busy} placeholder="Registre o contexto que não aparecerá no Foundry…" />
          )}
        </Field>
      </FormGrid>
      <Notice tone="info" title="Fontes desta sessão">
        O Foundry inclui só mensagens públicas capturadas. Notas manuais podem ser editadas antes de gerar qualquer
        rascunho. O Discord fica apenas como referência.
      </Notice>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" name="action" value="save" disabled={blocked}>
          {busy ? "Registrando…" : "Salvar sem iniciar"}
        </Button>
        <Button type="submit" name="action" value="start" variant="primary" disabled={blocked}>
          {busy ? "Iniciando…" : "Registrar e iniciar captura"}
        </Button>
      </div>
    </form>
  );
}

function ActiveSessionCard({
  item,
  canManage,
  endTriggerRef,
  refreshing,
  starting,
  startError,
  onStart,
  onEditContext,
  onEnd,
}: Readonly<{
  item: CampaignSession;
  canManage: boolean;
  endTriggerRef: RefObject<HTMLButtonElement | null>;
  refreshing: boolean;
  starting: boolean;
  startError: string | null;
  onStart: () => void;
  onEditContext: (trigger: HTMLElement) => void;
  onEnd: () => void;
}>) {
  const status = sessionStatusContent[item.status];
  return (
    <Card
      padding="lg"
      className={cn(
        "space-y-6 border-l-4",
        item.status === "capture_failed" ? "border-l-danger" : item.status === "active" ? "border-l-success" : "border-l-info",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-[60ch] space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>
              {item.status === "active" ? (
                <span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" aria-hidden="true" />
              ) : null}
              {status.label}
            </Badge>
            {refreshing ? <span className="text-xs text-fg-subtle">Atualizando…</span> : null}
          </div>
          <h2 className="font-display text-2xl leading-tight break-words sm:text-3xl">{item.title}</h2>
          <p className="text-sm text-fg-muted">{status.description}</p>
        </div>
      </header>
      <DetailList
        items={[
          { label: "Início", value: item.startedAt ? formatDateTime(item.startedAt) : "Ainda não iniciada" },
          { label: "Mestre", value: item.master.name },
          { label: "Missão", value: item.mission?.title ?? "Sem missão relacionada" },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-3" aria-label="Fontes da sessão" role="group">
        <FoundrySourceCard item={item} />
        <DiscordSourceCard item={item} />
        <NotesSourceCard item={item} />
      </div>
      {startError ? <Notice tone="danger" role="alert">{startError}</Notice> : null}
      {canManage ? (
        <footer className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
          <Button onClick={(event) => onEditContext(event.currentTarget)}>Adicionar ou editar notas</Button>
          {item.status === "capture_failed" ? (
            <Button onClick={onStart} disabled={starting}>
              {starting ? "Retomando captura…" : "Tentar iniciar captura"}
            </Button>
          ) : null}
          <Button ref={endTriggerRef} variant="danger" onClick={onEnd}>
            Encerrar e revisar fontes
          </Button>
        </footer>
      ) : null}
    </Card>
  );
}

function SourceCard({
  kicker,
  title,
  tone,
  children,
}: Readonly<{ kicker: string; title: string; tone: Tone; children: ReactNode }>) {
  const bar: Readonly<Record<Tone, string>> = {
    neutral: "bg-line-strong",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  };
  return (
    <article className="relative space-y-2 overflow-hidden rounded-md border border-line-soft bg-surface-2 p-4 pt-5">
      <span className={cn("absolute inset-x-0 top-0 h-0.5", bar[tone])} aria-hidden="true" />
      <p className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">{kicker}</p>
      <h3 className="font-semibold">{title}</h3>
      <div className="space-y-2 text-sm text-fg-muted">{children}</div>
    </article>
  );
}

function FoundrySourceCard({ item }: Readonly<{ item: CampaignSession }>) {
  if (!item.foundry) {
    return (
      <SourceCard kicker="Foundry" title="Sem mundo associado" tone="neutral">
        <p>Esta sessão usa só notas manuais. Nenhuma captura automática está configurada.</p>
      </SourceCard>
    );
  }
  const state = captureContent(item.foundry.captureStatus, item.foundry.worldStatus);
  const description =
    item.foundry.captureStatus === "failed" && item.foundry.errorMessage
      ? `${item.foundry.errorMessage} Tente iniciar a captura de novo ou encerre usando as fontes disponíveis.`
      : state.description;
  return (
    <SourceCard kicker="Foundry" title={state.label} tone={state.tone}>
      <p>{description}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-fg-subtle">Mundo</dt>
        <dd className="truncate">{item.foundry.worldTitle}</dd>
        <dt className="text-fg-subtle">Registros</dt>
        <dd className="tabular-nums">{item.foundry.messageCount}</dd>
        <dt className="text-fg-subtle">Último</dt>
        <dd>{item.foundry.lastMessageAt ? formatDateTime(item.foundry.lastMessageAt) : "Ainda não recebido"}</dd>
      </dl>
    </SourceCard>
  );
}

function DiscordSourceCard({ item }: Readonly<{ item: CampaignSession }>) {
  return (
    <SourceCard kicker="Discord" title={item.discordReference ? "Referência salva" : "Sem referência"} tone="neutral">
      <p>
        {item.discordReference
          ? "O canal ou tópico fica associado, mas as mensagens não entram no material coletado."
          : "Você pode registrar o nome de um canal ou tópico como referência da sessão."}
      </p>
      {item.discordReference ? <p className="font-mono text-xs text-fg">{item.discordReference}</p> : null}
    </SourceCard>
  );
}

function NotesSourceCard({ item }: Readonly<{ item: CampaignSession }>) {
  const hasNotes = item.notes.trim().length > 0;
  return (
    <SourceCard kicker="Notas do mestre" title={hasNotes ? "Notas adicionadas" : "Sem notas manuais"} tone={hasNotes ? "success" : "neutral"}>
      <p>
        {hasNotes
          ? "O conteúdo entra quando um rascunho for solicitado."
          : "Adicione acontecimentos que não ficaram no chat público do Foundry."}
      </p>
      {hasNotes ? <p className="line-clamp-3 border-l-2 border-line-strong pl-3 italic">{item.notes}</p> : null}
    </SourceCard>
  );
}

function SessionContextForm({
  item,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  item: CampaignSession;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: UpdateCampaignSessionInput) => void;
}>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const discordReference = String(data.get("discordReference") ?? "").trim();
    onSubmit({
      notes: String(data.get("notes") ?? ""),
      discordReference: discordReference || null,
      version: item.version,
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Field label="Canal ou tópico do Discord" optional hint="Só a referência é salva; as mensagens não são importadas.">
        {({ id, describedBy }) => (
          <Input id={id} name="discordReference" maxLength={200} defaultValue={item.discordReference ?? ""} disabled={busy} aria-describedby={describedBy} />
        )}
      </Field>
      <Field label="Notas do mestre" optional hint="Use só fatos da sessão. Você pode revisar este material antes de gerar.">
        {({ id, describedBy }) => (
          <Textarea id={id} name="notes" rows={9} maxLength={20_000} defaultValue={item.notes} disabled={busy} aria-describedby={describedBy} />
        )}
      </Field>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Salvando fontes…" : "Salvar fontes da sessão"}
        </Button>
      </div>
    </form>
  );
}

function PrepareDraft({
  item,
  job,
  quotaRemaining,
  quotaError,
  busy,
  retrying,
  error,
  retryError,
  canManage,
  onEditContext,
  onGenerate,
  onRetry,
  onOpenReview,
  onClose,
}: Readonly<{
  item: CampaignSession;
  job: AutomationJob | null;
  quotaRemaining: number | null;
  quotaError: string | null;
  busy: boolean;
  retrying: boolean;
  error: string | null;
  retryError: string | null;
  canManage: boolean;
  onEditContext: (trigger: HTMLElement) => void;
  onGenerate: (input: GenerateCampaignSessionDraftInput) => void;
  onRetry: (jobId: string) => void;
  onOpenReview: () => void;
  onClose: () => void;
}>) {
  const foundryCount = item.foundry?.messageCount ?? 0;
  const hasNotes = item.notes.trim().length > 0;
  const hasMaterial = foundryCount > 0 || hasNotes;
  const canRequestDraft = !item.automationJobId || job?.status === "cancelled";
  const jobState = job ? automationState(job) : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const suggestedTitle = String(data.get("suggestedTitle") ?? "").trim();
    const instructions = String(data.get("instructions") ?? "").trim();
    onGenerate({
      kind: "session_summary",
      ...(suggestedTitle ? { suggestedTitle } : {}),
      ...(instructions ? { instructions } : {}),
    });
  }

  return (
    <Card padding="lg" className="space-y-6" aria-labelledby={`prepare-draft-${item.id}`} role="region">
      <PanelHeader
        id={`prepare-draft-${item.id}`}
        eyebrow="Fontes encerradas"
        title={`Preparar rascunho de “${item.title}”`}
        description="Revise o inventário antes de enviar qualquer material para a revisão editorial."
        actions={<Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3" role="group" aria-label="Inventário das fontes">
        <SourceCard kicker="Foundry" title={foundryCount > 0 ? `${foundryCount} registros incluídos` : "Nenhum registro recebido"} tone={foundryCount > 0 ? "success" : "neutral"}>
          <p>{item.foundry?.lastMessageAt ? `Até ${formatDateTime(item.foundry.lastMessageAt)}` : "Sem período capturado"}</p>
        </SourceCard>
        <SourceCard kicker="Notas do mestre" title={hasNotes ? "Incluídas" : "Ausentes"} tone={hasNotes ? "success" : "neutral"}>
          <p>{hasNotes ? `${item.notes.length} caracteres disponíveis` : "Podem ser adicionadas antes de gerar"}</p>
        </SourceCard>
        <SourceCard kicker="Discord" title="Mensagens não importadas" tone="neutral">
          <p>{item.discordReference ?? "Nenhuma referência associada"}</p>
        </SourceCard>
      </div>

      {item.foundry?.transcriptTruncated ? (
        <Notice tone="warning">O registro do Foundry atingiu o limite de captura. O material preservado será usado de forma parcial.</Notice>
      ) : null}
      {hasMaterial && (foundryCount === 0 || !hasNotes || Boolean(item.discordReference)) ? (
        <Notice tone="warning">
          Este rascunho usará dados parciais: {foundryCount} registros do Foundry{hasNotes ? " e as notas do mestre" : ""}. As
          mensagens do Discord não são importadas.
        </Notice>
      ) : null}
      {!hasMaterial ? (
        <Notice
          tone="warning"
          title="Ainda não há material para gerar um rascunho"
          action={canManage ? <Button size="sm" onClick={(event) => onEditContext(event.currentTarget)}>Adicionar notas</Button> : null}
        >
          Adicione notas da sessão para continuar. A referência do Discord, sozinha, não é uma fonte importada.
        </Notice>
      ) : null}

      {item.automationJobId && job?.status !== "cancelled" ? (
        <div className="space-y-3 rounded-md border border-line-soft bg-surface-2 p-4" role="status">
          <p className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">Fluxo editorial</p>
          <h3 className="font-display text-lg">
            {jobState?.label ?? (item.postId || item.summaryId ? "Rascunho pronto para revisão" : "Processamento registrado")}
          </h3>
          <p className="text-sm text-fg-muted">{jobState?.description ?? "Acompanhe a fila em Automações para mais detalhes."}</p>
          <div className="flex flex-wrap gap-2">
            {item.postId || item.summaryId || job?.status === "awaiting_review" ? (
              <Button size="sm" variant="primary" onClick={onOpenReview}>Abrir mesa de revisão</Button>
            ) : null}
            {job?.status === "failed" && canManage ? (
              <Button size="sm" disabled={retrying || quotaRemaining === 0} onClick={() => onRetry(job.id)}>
                {retrying ? "Reenviando…" : "Tentar novamente"}
              </Button>
            ) : null}
          </div>
          {retryError ? <Notice tone="danger" role="alert">{retryError}</Notice> : null}
        </div>
      ) : canManage ? (
        <form className="space-y-5" onSubmit={submit}>
          {job?.status === "cancelled" ? (
            <Notice tone="info" role="status">
              O processamento anterior foi cancelado. As fontes continuam preservadas e podem gerar um novo rascunho.
            </Notice>
          ) : null}
          <FormGrid>
            <Notice className="full" tone="info" title="Resumo de sessão para o Diário">
              A automação organiza acontecimentos, decisões e pendências desta sessão num resumo, que vai para
              revisão no Diário de Sessões. Crônicas de lore são escritas em Crônicas ou geradas em Automações.
            </Notice>
            <Field label="Título sugerido" optional className="full">
              {({ id }) => <Input id={id} name="suggestedTitle" minLength={3} maxLength={140} disabled={busy || !hasMaterial} />}
            </Field>
            <Field label="Orientação editorial" optional className="full">
              {({ id }) => (
                <Textarea
                  id={id}
                  name="instructions"
                  minLength={3}
                  maxLength={2_000}
                  rows={3}
                  disabled={busy || !hasMaterial}
                  placeholder="Ex.: destaque as consequências das decisões do grupo"
                />
              )}
            </Field>
          </FormGrid>
          <div className="flex flex-wrap justify-end gap-3 border-t border-line-soft pt-4">
            <Button disabled={busy} onClick={(event) => onEditContext(event.currentTarget)}>Editar fontes manuais</Button>
            <Button type="submit" variant="primary" disabled={busy || !hasMaterial || quotaRemaining === 0}>
              {busy ? "Enviando para a fila…" : "Gerar resumo para o Diário"}
            </Button>
          </div>
        </form>
      ) : null}

      {quotaRemaining === 0 && canRequestDraft ? (
        <Notice tone="warning" role="status">
          A cota de hoje terminou. Você ainda pode revisar as fontes; novas gerações ficam disponíveis amanhã.
        </Notice>
      ) : null}
      {quotaError && canRequestDraft ? (
        <Notice tone="warning">Não foi possível consultar a cota agora. Se a geração falhar, suas fontes continuam preservadas.</Notice>
      ) : null}
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
    </Card>
  );
}

function SessionHistoryCard({
  item,
  job,
  canManage,
  starting,
  onStart,
  onPrepare,
  onOpenReview,
}: Readonly<{
  item: CampaignSession;
  job: AutomationJob | null;
  canManage: boolean;
  starting: boolean;
  onStart: () => void;
  onPrepare: () => void;
  onOpenReview: () => void;
}>) {
  const status = sessionStatusContent[item.status];
  const sourceSummary =
    [
      item.foundry ? `${item.foundry.messageCount} registros do Foundry` : null,
      item.notes.trim() ? "notas do mestre" : null,
      item.discordReference ? "referência do Discord" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Sem fontes adicionadas";
  const actions = [
    item.status === "prepared" && canManage ? (
      <Button key="start" size="sm" variant="primary" onClick={onStart} disabled={starting}>
        {starting ? "Iniciando captura…" : "Iniciar captura"}
      </Button>
    ) : null,
    item.status === "ended" && !item.automationJobId && canManage ? (
      <Button key="prepare" size="sm" variant="primary" onClick={onPrepare}>Preparar rascunho</Button>
    ) : null,
    item.status === "ended" && item.automationJobId && !item.postId && !item.summaryId ? (
      <Button key="follow" size="sm" onClick={onPrepare}>
        {job?.status === "cancelled" ? "Preparar novo rascunho" : "Acompanhar processamento"}
      </Button>
    ) : null,
    item.postId || item.summaryId || job?.status === "awaiting_review" ? (
      <Button key="review" size="sm" variant="primary" onClick={onOpenReview}>Abrir revisão</Button>
    ) : null,
  ].filter(Boolean);

  return (
    <Card className="flex h-full flex-col gap-4">
      <header className="space-y-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        <h3 className="font-display text-lg leading-tight break-words">{item.title}</h3>
        <p className="text-xs text-fg-subtle">
          {formatDateTime(item.startedAt ?? item.createdAt)} · {item.master.name}
        </p>
      </header>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">Mundo</dt>
          <dd className="text-fg-muted">{item.foundry?.worldTitle ?? "Sem mundo associado"}</dd>
        </div>
        <div>
          <dt className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">Fontes</dt>
          <dd className="text-fg-muted">{sourceSummary}</dd>
        </div>
        {item.automationJobId ? (
          <div>
            <dt className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">Editorial</dt>
            <dd className="text-fg-muted">{automationState(job)?.label ?? "Processamento registrado"}</dd>
          </div>
        ) : null}
      </dl>
      {actions.length > 0 ? <footer className="mt-auto flex flex-wrap gap-2 border-t border-line-soft pt-4">{actions}</footer> : null}
    </Card>
  );
}

function SessionsQueryError({ error, onRetry }: Readonly<{ error: unknown; onRetry: () => void }>) {
  const authError = error instanceof ApiClientError && error.status === 401;
  const permissionError = error instanceof ApiClientError && error.status === 403;
  return (
    <FeedbackState
      title={authError ? "Sua sessão expirou" : permissionError ? "Acesso não permitido" : "Não foi possível carregar as sessões"}
      tone="error"
      role="alert"
      action={
        authError ? (
          <ButtonAnchor variant="accent" href="/api/auth/discord?returnTo=/dashboard/sessoes">Entrar novamente</ButtonAnchor>
        ) : !permissionError ? (
          <Button onClick={onRetry}>Tentar novamente</Button>
        ) : null
      }
    >
      {authError
        ? "Entre de novo para continuar. Nada foi perdido."
        : permissionError
          ? "Seu perfil não tem acesso aos registros desta campanha."
          : errorMessage(error)}
    </FeedbackState>
  );
}

function captureContent(
  status: CampaignSessionCaptureStatus,
  worldStatus: "online" | "offline" | "revoked",
): Readonly<{ label: string; description: string; tone: Tone }> {
  if (status === "starting") return { label: "Iniciando captura", description: "O portal está preparando o registro deste mundo.", tone: "info" };
  if (status === "capturing") return { label: "Capturando agora", description: "Mensagens públicas do Foundry estão chegando à sessão.", tone: "success" };
  if (status === "ended") return { label: "Captura encerrada", description: "Nenhum novo evento será acrescentado.", tone: "neutral" };
  if (status === "cancelled") return { label: "Captura cancelada", description: "Os registros anteriores continuam preservados.", tone: "neutral" };
  if (status === "interrupted") {
    return {
      label: "Captura interrompida",
      description:
        worldStatus === "revoked"
          ? "A conexão do mundo foi revogada. Reconecte-o em Mundos do Foundry."
          : "O Foundry perdeu contato. Os registros já recebidos foram preservados.",
      tone: "warning",
    };
  }
  if (status === "failed") return { label: "Falha ao receber registros", description: "Tente iniciar a captura de novo ou encerre usando as fontes disponíveis.", tone: "danger" };
  if (status === "not_configured") return { label: "Sem captura automática", description: "Esta sessão depende de notas manuais.", tone: "neutral" };
  return worldStatus === "offline"
    ? { label: "Aguardando o Foundry", description: "A captura começa quando o mestre entrar no mundo.", tone: "warning" }
    : { label: "Nenhum registro ainda", description: "O mundo está disponível, mas ainda não enviou mensagens públicas.", tone: "info" };
}

function automationState(job: AutomationJob | null): Readonly<{ label: string; description: string }> | null {
  if (!job) return null;
  if (job.status === "queued") return { label: "Na fila", description: "O registro aguarda processamento." };
  if (job.status === "processing") return { label: "Gerando", description: "As fontes da sessão estão sendo organizadas." };
  if (job.status === "awaiting_review") return { label: "Revisão humana", description: "O rascunho foi criado e aguarda revisão." };
  if (job.status === "failed") return { label: "Falhou", description: job.errorMessage ?? "O material foi preservado e pode ser reenviado." };
  return { label: "Cancelada", description: "Nenhum rascunho foi criado." };
}

function worldStatusLabel(status: "online" | "offline" | "revoked"): string {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Desconectado";
}
