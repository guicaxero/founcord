"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutomationJob,
  AutomationJobListResponse,
  AutomationKind,
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
} from "@vigilia/contracts";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";

const sessionStatusContent: Readonly<
  Record<CampaignSessionStatus, Readonly<{ label: string; description: string }>>
> = {
  prepared: {
    label: "Preparada",
    description: "A sessão foi registrada e ainda não começou.",
  },
  starting: {
    label: "Iniciando captura",
    description: "O portal está preparando o registro do Foundry.",
  },
  active: {
    label: "Em andamento",
    description: "A sessão está aberta para receber registros e notas.",
  },
  ended: {
    label: "Encerrada",
    description: "A captura terminou e as fontes podem seguir para revisão.",
  },
  cancelled: {
    label: "Cancelada",
    description: "A sessão foi encerrada sem continuar o fluxo editorial.",
  },
  capture_failed: {
    label: "Captura interrompida",
    description: "Os registros recebidos foram preservados e a captura pode ser retomada.",
  },
};

const automationKindContent: Readonly<Record<AutomationKind, string>> = {
  session_summary: "Resumo de sessão",
  chronicle_draft: "Rascunho de crônica",
  record_extraction: "Extrair registros",
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
  const endTriggerRef = useRef<HTMLButtonElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingContextId, setEditingContextId] = useState<string | null>(null);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState<CampaignSession | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const canManage = hasCapability(me, "session:manage", campaignId);

  const sessions = useQuery({
    queryKey: queryKeys.campaignSessions(campaignId),
    queryFn: () =>
      apiFetch<CampaignSessionListResponse>(
        `/api/campaigns/${campaignId}/sessions`,
      ),
    refetchInterval: (query) =>
      query.state.data?.data.some((item) =>
        item.status === "active" || item.status === "starting",
      )
        ? 5_000
        : false,
  });
  const options = useQuery({
    queryKey: queryKeys.campaignSessionOptions(campaignId),
    queryFn: () =>
      apiFetch<CampaignSessionOptions>(
        `/api/campaigns/${campaignId}/sessions/options`,
      ),
    enabled: canManage,
    staleTime: 30_000,
  });
  const automations = useQuery({
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

  async function invalidateSessions() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignSessions(campaignId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) }),
    ]);
  }

  const create = useMutation({
    mutationFn: (input: CreateCampaignSessionInput) =>
      apiFetch<CampaignSession>(`/api/campaigns/${campaignId}/sessions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (created) => {
      setShowCreate(false);
      setFocusedSessionId(created.id);
      await invalidateSessions();
    },
    onError: invalidateSessions,
  });
  const update = useMutation({
    mutationFn: ({
      sessionId,
      input,
    }: Readonly<{ sessionId: string; input: UpdateCampaignSessionInput }>) =>
      apiFetch<CampaignSession>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: async (updated) => {
      setEditingContextId(null);
      setFocusedSessionId(updated.id);
      await invalidateSessions();
    },
  });
  const start = useMutation({
    mutationFn: (item: CampaignSession) =>
      apiFetch<CampaignSession>(
        `/api/campaigns/${campaignId}/sessions/${item.id}/start`,
        { method: "POST", body: JSON.stringify({ version: item.version }) },
      ),
    onSuccess: async (started) => {
      setFocusedSessionId(started.id);
      await invalidateSessions();
    },
    onError: invalidateSessions,
  });
  const end = useMutation({
    mutationFn: (item: CampaignSession) =>
      apiFetch<CampaignSession>(
        `/api/campaigns/${campaignId}/sessions/${item.id}/end`,
        { method: "POST", body: JSON.stringify({ version: item.version }) },
      ),
    onSuccess: async (ended) => {
      setEndingSession(null);
      setFocusedSessionId(ended.id);
      await invalidateSessions();
    },
  });
  const generate = useMutation({
    mutationFn: ({
      sessionId,
      input,
    }: Readonly<{
      sessionId: string;
      input: GenerateCampaignSessionDraftInput;
    }>) =>
      apiFetch<CampaignSessionGenerationResponse>(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/draft`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async (result) => {
      setFocusedSessionId(result.session.id);
      await Promise.all([
        invalidateSessions(),
        queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) }),
      ]);
    },
  });
  const retry = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<AutomationJob>(
        `/api/campaigns/${campaignId}/automations/${jobId}/retry`,
        { method: "POST" },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.automations(campaignId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.campaignSessions(campaignId) }),
      ]);
    },
  });

  if (sessions.isLoading) {
    return <SessionsLoading />;
  }

  if (sessions.isError) {
    return <SessionsQueryError error={sessions.error} onRetry={() => sessions.refetch()} />;
  }

  const data = sessions.data?.data ?? [];
  const activeSession = data.find((item) =>
    item.status === "active" ||
    item.status === "starting" ||
    item.status === "capture_failed",
  );
  const focusedSession = focusedSessionId
    ? data.find((item) => item.id === focusedSessionId) ?? null
    : null;
  const draftSession = focusedSession?.status === "ended"
    ? focusedSession
    : !activeSession
      ? data.find((item) => item.status === "ended" && !item.automationJobId) ?? null
      : null;
  const jobsById = new Map(
    (automations.data?.data ?? []).map((job) => [job.id, job] as const),
  );
  const recentSessions = data.filter((item) => item.id !== activeSession?.id);
  const filteredSessions = recentSessions.filter((item) => {
    if (historyFilter === "all") return true;
    if (historyFilter === "ended") {
      return item.status === "ended" || item.status === "cancelled";
    }
    return item.status === "prepared" || item.status === "starting" ||
      item.status === "active" || item.status === "capture_failed";
  });

  async function openReview() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.posts(campaignId, "editorial"),
    });
    onOpenReview();
  }

  return (
    <div className="sessions-panel">
      <section className="sessions-overview" aria-labelledby="sessions-overview-title">
        <div>
          <span className="admin-eyebrow">Caderno da expedição</span>
          <h2 id="sessions-overview-title">
            {activeSession ? "Sessão em andamento" : "A memória da mesa começa aqui"}
          </h2>
          <p>
            Registre o ciclo real da mesa, acompanhe o que chegou do Foundry e escolha
            conscientemente quais fontes seguirão para a oficina editorial.
          </p>
        </div>
        {canManage && !activeSession ? (
          <button
            className="admin-primary"
            type="button"
            onClick={() => {
              create.reset();
              setShowCreate((current) => !current);
            }}
            aria-expanded={showCreate}
            aria-controls="session-registration"
          >
            {showCreate ? "Fechar formulário" : "Registrar sessão"}
          </button>
        ) : null}
      </section>

      {sessions.isFetching ? (
        <p className="sessions-refresh-note" aria-hidden="true">Atualizando registros…</p>
      ) : null}

      {showCreate && canManage ? (
        <SessionRegistrationForm
          me={me}
          options={options.data}
          optionsLoading={options.isLoading}
          optionsError={options.isError ? errorMessage(options.error) : null}
          busy={create.isPending}
          error={create.isError ? errorMessage(create.error) : null}
          onRetryOptions={() => options.refetch()}
          onCancel={() => {
            create.reset();
            setShowCreate(false);
          }}
          onSubmit={(input) => create.mutate(input)}
          campaignId={campaignId}
        />
      ) : null}

      {data.length === 0 && !showCreate ? (
        <section className="sessions-empty admin-card">
          <span className="sessions-empty-mark" aria-hidden="true">◇</span>
          <h2>Nenhuma sessão registrada</h2>
          <p>
            Registre uma sessão para reunir acontecimentos do Foundry e notas da mesa
            em um único lugar.
          </p>
          {canManage ? (
            <button className="admin-primary" type="button" onClick={() => setShowCreate(true)}>
              Registrar primeira sessão
            </button>
          ) : null}
        </section>
      ) : null}

      {activeSession ? (
        <ActiveSessionCard
          item={activeSession}
          canManage={canManage}
          endTriggerRef={endTriggerRef}
          starting={start.isPending}
          startError={start.isError ? errorMessage(start.error) : null}
          onStart={() => start.mutate(activeSession)}
          onEditContext={() => {
            update.reset();
            setEditingContextId(activeSession.id);
          }}
          onEnd={() => {
            end.reset();
            setEndingSession(activeSession);
          }}
        />
      ) : null}

      {editingContextId ? (
        <SessionContextEditor
          item={data.find((candidate) => candidate.id === editingContextId) ?? null}
          busy={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onCancel={() => {
            update.reset();
            setEditingContextId(null);
          }}
          onSubmit={(sessionId, input) => update.mutate({ sessionId, input })}
        />
      ) : null}

      {draftSession ? (
        <PrepareDraft
          item={draftSession}
          job={draftSession.automationJobId
            ? jobsById.get(draftSession.automationJobId) ?? null
            : null}
          quotaRemaining={automations.data?.quota.remainingToday ?? null}
          quotaError={automations.isError ? errorMessage(automations.error) : null}
          busy={generate.isPending}
          retrying={retry.isPending}
          error={generate.isError ? errorMessage(generate.error) : null}
          retryError={retry.isError ? errorMessage(retry.error) : null}
          canManage={canManage}
          onEditContext={() => {
            update.reset();
            setEditingContextId(draftSession.id);
          }}
          onGenerate={(input) => generate.mutate({ sessionId: draftSession.id, input })}
          onRetry={(jobId) => retry.mutate(jobId)}
          onOpenReview={openReview}
          onClose={() => setFocusedSessionId(null)}
        />
      ) : null}

      {recentSessions.length > 0 ? (
        <section className="sessions-history" aria-labelledby="sessions-history-title">
          <div className="admin-section-title sessions-history-heading">
            <div>
              <span>Registros preservados</span>
              <h2 id="sessions-history-title">Sessões recentes</h2>
              <p>Retome uma sessão preparada ou acompanhe o caminho até a revisão.</p>
            </div>
            <div className="sessions-filters" aria-label="Filtrar sessões recentes">
              {([
                ["all", "Todas"],
                ["ongoing", "Em andamento"],
                ["ended", "Encerradas"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={historyFilter === value}
                  onClick={() => setHistoryFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {filteredSessions.length === 0 ? (
            <div className="sessions-filter-empty">
              <p>Nenhuma sessão corresponde a este filtro.</p>
              <button type="button" className="secondary-action" onClick={() => setHistoryFilter("all")}>
                Mostrar todas
              </button>
            </div>
          ) : (
            <div className="sessions-history-grid">
              {filteredSessions.map((item) => (
                <SessionHistoryCard
                  key={item.id}
                  item={item}
                  job={item.automationJobId ? jobsById.get(item.automationJobId) ?? null : null}
                  canManage={canManage}
                  starting={start.isPending && start.variables?.id === item.id}
                  onStart={() => start.mutate(item)}
                  onPrepare={() => setFocusedSessionId(item.id)}
                  onOpenReview={openReview}
                />
              ))}
            </div>
          )}
          {start.isError && !activeSession ? (
            <p className="inline-error" role="alert">{errorMessage(start.error)}</p>
          ) : null}
        </section>
      ) : null}

      <EndSessionDialog
        item={endingSession}
        busy={end.isPending}
        error={end.isError ? errorMessage(end.error) : null}
        returnFocusRef={endTriggerRef}
        onCancel={() => {
          if (!end.isPending) {
            end.reset();
            setEndingSession(null);
          }
        }}
        onConfirm={() => endingSession && end.mutate(endingSession)}
      />
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
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

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
    <section className="admin-card session-registration" id="session-registration" aria-labelledby="session-registration-title">
      <div className="admin-section-title">
        <div>
          <span>Novo registro</span>
          <h2 id="session-registration-title">Registrar sessão</h2>
          <p>Defina o contexto da mesa e escolha quais fontes estarão disponíveis desde o início.</p>
        </div>
      </div>
      {optionsLoading ? <p className="sessions-options-note">Carregando missões e mundos disponíveis…</p> : null}
      {optionsError ? (
        <div className="inline-error" role="alert">
          <p>{optionsError}</p>
          <button className="secondary-action" type="button" onClick={onRetryOptions}>Tentar novamente</button>
        </div>
      ) : null}
      {options && !options.foundryAvailable ? (
        <p className="inline-warning" role="status">
          Os mundos do Foundry estão temporariamente indisponíveis. Você pode continuar
          sem mundo e registrar a sessão usando notas manuais.
        </p>
      ) : null}
      <form className="admin-form sessions-form" onSubmit={submit}>
        <label className="full">
          Nome da sessão
          <input
            name="title"
            required
            minLength={3}
            maxLength={140}
            placeholder="Ex.: Sessão 12 — O moinho abandonado"
            disabled={busy}
          />
        </label>
        <label>
          Missão relacionada <span className="optional-field">opcional</span>
          <select name="missionId" defaultValue="" disabled={busy || Boolean(optionsError)}>
            <option value="">Nenhuma missão relacionada</option>
            {options?.missions.map((mission) => (
              <option value={mission.id} key={mission.id}>{mission.title}</option>
            ))}
          </select>
        </label>
        <label>
          Mestre responsável
          <input value={me.user?.displayName ?? "Mestre atual"} readOnly aria-describedby="session-master-help" />
          <small id="session-master-help">Nesta versão, o registro fica sob responsabilidade de quem o cria.</small>
        </label>
        <label className="full">
          Mundo do Foundry
          <select
            name="worldId"
            defaultValue=""
            disabled={busy || Boolean(optionsError) || options?.foundryAvailable === false}
            aria-describedby="session-world-help"
          >
            <option value="">Sem mundo — usar apenas notas manuais</option>
            {options?.worlds.map((world) => (
              <option value={world.worldId} key={world.worldId} disabled={world.status === "revoked"}>
                {world.worldTitle} — {worldStatusLabel(world.status)}
              </option>
            ))}
          </select>
          <small id="session-world-help">
            {options?.foundryAvailable && options.worlds.length === 0
              ? "Nenhum mundo está conectado a esta campanha. A sessão usará notas manuais."
              : "A captura automática começa quando o mundo selecionado estiver disponível."}
          </small>
        </label>
        <label className="full">
          Canal ou tópico do Discord <span className="optional-field">opcional</span>
          <input
            name="discordReference"
            maxLength={200}
            placeholder="Ex.: #sessao-12 ou Crônica — O moinho"
            disabled={busy}
            aria-describedby="session-discord-help"
          />
          <small id="session-discord-help">Nesta versão, a referência será salva, mas as mensagens do Discord não serão importadas automaticamente.</small>
        </label>
        <label className="full">
          Notas iniciais <span className="optional-field">opcional</span>
          <textarea
            name="notes"
            rows={6}
            maxLength={20_000}
            disabled={busy}
            placeholder="Registre contexto que não aparecerá no Foundry…"
          />
        </label>
        <div className="sessions-registration-summary full">
          <strong>Fontes desta sessão</strong>
          <p>O Foundry incluirá apenas mensagens públicas capturadas. Notas manuais podem ser editadas antes de gerar qualquer rascunho. O Discord será somente uma referência.</p>
        </div>
        <div className="form-actions sessions-form-actions full">
          <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button type="submit" name="action" value="save" disabled={busy || optionsLoading || Boolean(optionsError)}>
            {busy ? "Registrando…" : "Salvar sem iniciar"}
          </button>
          <button className="admin-primary" type="submit" name="action" value="start" disabled={busy || optionsLoading || Boolean(optionsError)}>
            {busy ? "Iniciando registro…" : "Registrar e iniciar captura"}
          </button>
        </div>
      </form>
      {error ? <p className="inline-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p> : null}
    </section>
  );
}

function ActiveSessionCard({
  item,
  canManage,
  endTriggerRef,
  starting,
  startError,
  onStart,
  onEditContext,
  onEnd,
}: Readonly<{
  item: CampaignSession;
  canManage: boolean;
  endTriggerRef: RefObject<HTMLButtonElement | null>;
  starting: boolean;
  startError: string | null;
  onStart: () => void;
  onEditContext: () => void;
  onEnd: () => void;
}>) {
  const status = sessionStatusContent[item.status];
  return (
    <article className={`active-session-card is-${item.status}`} aria-labelledby={`active-session-${item.id}`}>
      <header>
        <div>
          <span className={`session-status is-${item.status}`}>{status.label}</span>
          <h2 id={`active-session-${item.id}`}>{item.title}</h2>
          <p>{status.description}</p>
        </div>
        <dl className="session-primary-meta">
          <div><dt>Início</dt><dd>{item.startedAt ? formatDate(item.startedAt) : "Ainda não iniciada"}</dd></div>
          <div><dt>Mestre</dt><dd>{item.master.name}</dd></div>
          <div><dt>Missão</dt><dd>{item.mission?.title ?? "Sem missão relacionada"}</dd></div>
        </dl>
      </header>

      <div className="session-sources" aria-label="Fontes da sessão">
        <FoundrySourceCard item={item} />
        <DiscordSourceCard item={item} />
        <NotesSourceCard item={item} />
      </div>

      {startError ? <p className="inline-error" role="alert">{startError}</p> : null}
      {canManage ? (
        <footer className="active-session-actions">
          <button className="secondary-action" type="button" onClick={onEditContext}>
            Adicionar ou editar notas
          </button>
          {item.status === "capture_failed" ? (
            <button className="secondary-action" type="button" onClick={onStart} disabled={starting}>
              {starting ? "Retomando captura…" : "Tentar iniciar captura"}
            </button>
          ) : null}
          <button className="danger-secondary" type="button" onClick={onEnd} ref={endTriggerRef}>
            Encerrar e revisar fontes
          </button>
        </footer>
      ) : null}
    </article>
  );
}

function FoundrySourceCard({ item }: Readonly<{ item: CampaignSession }>) {
  if (!item.foundry) {
    return (
      <article className="session-source-card is-neutral">
        <span className="source-kicker">Foundry</span>
        <h3>Sem mundo associado</h3>
        <p>Esta sessão usa somente notas manuais. Nenhuma captura automática está configurada.</p>
      </article>
    );
  }
  const state = captureContent(item.foundry.captureStatus, item.foundry.worldStatus);
  const description = item.foundry.captureStatus === "failed" && item.foundry.errorMessage
    ? `${item.foundry.errorMessage} Tente iniciar a captura novamente ou encerre usando as fontes disponíveis.`
    : state.description;
  return (
    <article className={`session-source-card is-${item.foundry.captureStatus}`}>
      <span className="source-kicker">Foundry</span>
      <h3>{state.label}</h3>
      <p>{description}</p>
      <dl>
        <div><dt>Mundo</dt><dd>{item.foundry.worldTitle}</dd></div>
        <div><dt>Registros recebidos</dt><dd>{item.foundry.messageCount}</dd></div>
        <div><dt>Último recebimento</dt><dd>{item.foundry.lastMessageAt ? formatDate(item.foundry.lastMessageAt) : "Ainda não recebido"}</dd></div>
      </dl>
    </article>
  );
}

function DiscordSourceCard({ item }: Readonly<{ item: CampaignSession }>) {
  return (
    <article className="session-source-card is-reference">
      <span className="source-kicker">Discord</span>
      <h3>{item.discordReference ? "Referência salva — mensagens não importadas" : "Nenhuma referência do Discord"}</h3>
      <p>
        {item.discordReference
          ? "O canal ou tópico está associado, mas suas mensagens não fazem parte do material coletado nesta versão."
          : "Você pode registrar o nome de um canal ou tópico como referência da sessão."}
      </p>
      {item.discordReference ? <strong className="source-reference">{item.discordReference}</strong> : null}
    </article>
  );
}

function NotesSourceCard({ item }: Readonly<{ item: CampaignSession }>) {
  const hasNotes = item.notes.trim().length > 0;
  return (
    <article className={`session-source-card ${hasNotes ? "is-ready" : "is-neutral"}`}>
      <span className="source-kicker">Notas do mestre</span>
      <h3>{hasNotes ? "Notas adicionadas" : "Sem notas manuais"}</h3>
      <p>
        {hasNotes
          ? "O conteúdo será incluído quando um rascunho for solicitado."
          : "Adicione acontecimentos que não foram registrados no chat público do Foundry."}
      </p>
      {hasNotes ? <p className="session-notes-preview">“{item.notes}”</p> : null}
    </article>
  );
}

function SessionContextEditor({
  item,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  item: CampaignSession | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (sessionId: string, input: UpdateCampaignSessionInput) => void;
}>) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  if (!item) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const discordReference = String(data.get("discordReference") ?? "").trim();
    onSubmit(item!.id, {
      notes: String(data.get("notes") ?? ""),
      discordReference: discordReference || null,
      version: item!.version,
    });
  }

  return (
    <section className="admin-card session-context-editor" aria-labelledby="session-context-title">
      <div className="admin-section-title">
        <div>
          <span>Complementar registro</span>
          <h2 id="session-context-title">Fontes manuais de “{item.title}”</h2>
          <p>As alterações ficam salvas na sessão, mas nenhum rascunho é gerado automaticamente.</p>
        </div>
      </div>
      <form className="admin-form" key={item.version} onSubmit={submit}>
        <label className="full">
          Canal ou tópico do Discord <span className="optional-field">opcional</span>
          <input name="discordReference" maxLength={200} defaultValue={item.discordReference ?? ""} disabled={busy} aria-describedby="context-discord-help" />
          <small id="context-discord-help">Somente a referência será salva; as mensagens não serão importadas nesta versão.</small>
        </label>
        <label className="full">
          Notas do mestre <span className="optional-field">opcional</span>
          <textarea name="notes" rows={9} maxLength={20_000} defaultValue={item.notes} disabled={busy} />
          <small>Use apenas fatos da sessão. Você poderá revisar este material novamente antes de gerar.</small>
        </label>
        <div className="form-actions full">
          <button type="button" disabled={busy} onClick={onCancel}>Cancelar edição</button>
          <button className="admin-primary" type="submit" disabled={busy}>
            {busy ? "Salvando fontes…" : "Salvar fontes da sessão"}
          </button>
        </div>
      </form>
      {error ? <p className="inline-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p> : null}
    </section>
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
  onEditContext: () => void;
  onGenerate: (input: GenerateCampaignSessionDraftInput) => void;
  onRetry: (jobId: string) => void;
  onOpenReview: () => void;
  onClose: () => void;
}>) {
  const foundryCount = item.foundry?.messageCount ?? 0;
  const hasNotes = item.notes.trim().length > 0;
  const hasMaterial = foundryCount > 0 || hasNotes;
  const canRequestDraft = !item.automationJobId || job?.status === "cancelled";
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const suggestedTitle = String(data.get("suggestedTitle") ?? "").trim();
    const instructions = String(data.get("instructions") ?? "").trim();
    onGenerate({
      kind: String(data.get("kind")) as AutomationKind,
      ...(suggestedTitle ? { suggestedTitle } : {}),
      ...(instructions ? { instructions } : {}),
    });
  }

  const jobState = job ? automationState(job) : null;
  return (
    <section className="prepare-draft admin-card" aria-labelledby={`prepare-draft-${item.id}`}>
      <div className="admin-section-title prepare-draft-heading">
        <div>
          <span>Fontes encerradas</span>
          <h2 id={`prepare-draft-${item.id}`}>Preparar rascunho de “{item.title}”</h2>
          <p>Revise o inventário abaixo antes de enviar qualquer material à oficina editorial.</p>
        </div>
        <button className="secondary-action" type="button" onClick={onClose}>Fechar preparação</button>
      </div>

      <div className="draft-source-inventory" aria-label="Inventário das fontes">
        <article className={foundryCount > 0 ? "is-included" : "is-missing"}>
          <span>Foundry</span>
          <strong>{foundryCount > 0 ? `${foundryCount} registros incluídos` : "Nenhum registro recebido"}</strong>
          <small>{item.foundry?.lastMessageAt ? `Até ${formatDate(item.foundry.lastMessageAt)}` : "Sem período capturado"}</small>
        </article>
        <article className={hasNotes ? "is-included" : "is-missing"}>
          <span>Notas do mestre</span>
          <strong>{hasNotes ? "Incluídas" : "Ausentes"}</strong>
          <small>{hasNotes ? `${item.notes.length} caracteres disponíveis` : "Podem ser adicionadas antes de gerar"}</small>
        </article>
        <article className="is-unavailable">
          <span>Discord</span>
          <strong>Mensagens não importadas</strong>
          <small>{item.discordReference ?? "Nenhuma referência associada"}</small>
        </article>
      </div>

      {item.foundry?.transcriptTruncated ? (
        <p className="inline-warning">O registro do Foundry atingiu o limite de captura. O material preservado será usado de forma parcial.</p>
      ) : null}
      {hasMaterial && (foundryCount === 0 || !hasNotes || Boolean(item.discordReference)) ? (
        <p className="inline-warning">
          Este rascunho usará dados parciais. Serão incluídos {foundryCount} registros do Foundry
          {hasNotes ? " e as notas do mestre" : ""}. As mensagens do Discord não foram importadas.
        </p>
      ) : null}
      {!hasMaterial ? (
        <div className="sessions-source-missing">
          <strong>Ainda não há material para gerar um rascunho.</strong>
          <p>Adicione notas da sessão para continuar. A referência do Discord, sozinha, não é uma fonte importada.</p>
          {canManage ? <button className="secondary-action" type="button" onClick={onEditContext}>Adicionar notas da sessão</button> : null}
        </div>
      ) : null}

      {item.automationJobId && job?.status !== "cancelled" ? (
        <div className={`session-editorial-state is-${job?.status ?? "registered"}`} role="status">
          <span>Fluxo editorial</span>
          <h3>{jobState?.label ?? (item.postId || item.summaryId ? "Rascunho pronto para revisão" : "Processamento registrado")}</h3>
          <p>{jobState?.description ?? "Acompanhe a fila em Automações para mais detalhes."}</p>
          <div className="session-editorial-actions">
            {item.postId || item.summaryId || job?.status === "awaiting_review" ? (
              <button className="admin-primary" type="button" onClick={onOpenReview}>Abrir mesa de revisão</button>
            ) : null}
            {job?.status === "failed" && canManage ? (
              <button className="secondary-action" type="button" disabled={retrying || quotaRemaining === 0} onClick={() => onRetry(job.id)}>
                {retrying ? "Reenviando…" : "Tentar novamente"}
              </button>
            ) : null}
          </div>
          {retryError ? <p className="inline-error" role="alert">{retryError}</p> : null}
        </div>
      ) : canManage ? (
        <>
          {job?.status === "cancelled" ? (
            <p className="inline-warning" role="status">
              O processamento anterior foi cancelado. As fontes continuam preservadas
              e podem ser enviadas para um novo rascunho.
            </p>
          ) : null}
          <form className="admin-form session-draft-form" onSubmit={submit}>
          <label>
            Resultado desejado
            <select name="kind" defaultValue="session_summary" required disabled={busy || !hasMaterial}>
              {Object.entries(automationKindContent).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Título sugerido <span className="optional-field">opcional</span>
            <input name="suggestedTitle" minLength={3} maxLength={140} disabled={busy || !hasMaterial} />
          </label>
          <label className="full">
            Orientação editorial <span className="optional-field">opcional</span>
            <textarea name="instructions" minLength={3} maxLength={2_000} rows={4} disabled={busy || !hasMaterial} placeholder="Ex.: destaque as consequências das decisões do grupo" />
          </label>
          <div className="session-draft-actions full">
            <button className="secondary-action" type="button" onClick={onEditContext} disabled={busy}>Editar fontes manuais</button>
            <button className="admin-primary" type="submit" disabled={busy || !hasMaterial || quotaRemaining === 0}>
              {busy ? "Enviando para a fila…" : "Gerar rascunho para revisão"}
            </button>
          </div>
          </form>
        </>
      ) : null}

      {quotaRemaining === 0 && canRequestDraft ? (
        <p className="inline-warning" role="status">A cota de hoje terminou. Você ainda pode revisar fontes; novas gerações estarão disponíveis amanhã.</p>
      ) : null}
      {quotaError && canRequestDraft ? (
        <p className="inline-warning">Não foi possível consultar a cota agora. Se a geração falhar, suas fontes continuarão preservadas.</p>
      ) : null}
      {error ? <p className="inline-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p> : null}
    </section>
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
  const sourceSummary = [
    item.foundry ? `${item.foundry.messageCount} registros do Foundry` : null,
    item.notes.trim() ? "notas do mestre" : null,
    item.discordReference ? "referência do Discord" : null,
  ].filter(Boolean).join(" · ") || "Sem fontes adicionadas";
  return (
    <article className="session-history-card">
      <header>
        <span className={`session-status is-${item.status}`}>{status.label}</span>
        <h3>{item.title}</h3>
        <p>{formatDate(item.startedAt ?? item.createdAt)} · {item.master.name}</p>
      </header>
      <dl>
        <div><dt>Mundo</dt><dd>{item.foundry?.worldTitle ?? "Sem mundo associado"}</dd></div>
        <div><dt>Fontes</dt><dd>{sourceSummary}</dd></div>
        {item.automationJobId ? <div><dt>Editorial</dt><dd>{automationState(job)?.label ?? "Processamento registrado"}</dd></div> : null}
      </dl>
      <footer>
        {item.status === "prepared" && canManage ? (
          <button className="admin-primary" type="button" onClick={onStart} disabled={starting}>
            {starting ? "Iniciando captura…" : "Iniciar captura"}
          </button>
        ) : null}
        {item.status === "ended" && !item.automationJobId && canManage ? (
          <button className="admin-primary" type="button" onClick={onPrepare}>Preparar rascunho</button>
        ) : null}
        {item.status === "ended" && item.automationJobId && !item.postId && !item.summaryId ? (
          <button className="secondary-action" type="button" onClick={onPrepare}>
            {job?.status === "cancelled" ? "Preparar novo rascunho" : "Acompanhar processamento"}
          </button>
        ) : null}
        {item.postId || item.summaryId || job?.status === "awaiting_review" ? (
          <button className="admin-primary" type="button" onClick={onOpenReview}>Abrir revisão</button>
        ) : null}
      </footer>
    </article>
  );
}

function EndSessionDialog({
  item,
  busy,
  error,
  returnFocusRef,
  onCancel,
  onConfirm,
}: Readonly<{
  item: CampaignSession | null;
  busy: boolean;
  error: string | null;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const safeActionRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (item && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => safeActionRef.current?.focus());
    }
    if (!item && dialog.open) {
      dialog.close();
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    }
  }, [item, returnFocusRef]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <dialog
      className="destructive-dialog session-end-dialog"
      ref={dialogRef}
      aria-labelledby="end-session-title"
      aria-describedby="end-session-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="destructive-dialog-card">
        <span className="dialog-kicker">ENCERRAR CAPTURA</span>
        <h2 id="end-session-title">Encerrar “{item?.title}”?</h2>
        <p id="end-session-description">Novos eventos não serão adicionados automaticamente. As fontes já recebidas continuarão preservadas para revisão.</p>
        <dl className="session-end-summary">
          <div><dt>Mundo afetado</dt><dd>{item?.foundry?.worldTitle ?? "Nenhum mundo associado"}</dd></div>
          <div><dt>Registros capturados</dt><dd>{item?.foundry?.messageCount ?? 0}</dd></div>
          <div><dt>Notas do mestre</dt><dd>{item?.notes.trim() ? "Incluídas" : "Ausentes"}</dd></div>
          <div><dt>Discord</dt><dd>Mensagens não importadas</dd></div>
        </dl>
        {error ? <p className="inline-error" role="alert" tabIndex={-1} ref={errorRef}>{error} Você pode tentar novamente ou continuar a sessão.</p> : null}
        <div className="dialog-actions">
          <button type="button" ref={safeActionRef} disabled={busy} onClick={onCancel}>Continuar sessão</button>
          <button className="danger-primary" type="button" disabled={busy || !item} onClick={onConfirm}>
            {busy ? "Encerrando captura…" : "Encerrar captura"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function SessionsLoading() {
  return (
    <div className="sessions-loading" aria-live="polite" aria-busy="true">
      <span className="sessions-heading-skeleton" />
      <div className="session-sources">
        <span className="session-card-skeleton" />
        <span className="session-card-skeleton" />
        <span className="session-card-skeleton" />
      </div>
      <p>Reunindo as sessões e suas fontes…</p>
    </div>
  );
}

function SessionsQueryError({ error, onRetry }: Readonly<{ error: unknown; onRetry: () => void }>) {
  const authError = error instanceof ApiClientError && error.status === 401;
  const permissionError = error instanceof ApiClientError && error.status === 403;
  return (
    <section className="admin-card foundry-query-state" role="alert">
      <span className="sessions-empty-mark" aria-hidden="true">◇</span>
      <h2>{authError ? "Sua sessão expirou" : permissionError ? "Acesso não permitido" : "Não foi possível carregar as sessões"}</h2>
      <p>
        {authError
          ? "Entre novamente para continuar sem confundir uma sessão expirada com um histórico vazio."
          : permissionError
            ? "Seu perfil não possui acesso aos registros desta campanha."
            : errorMessage(error)}
      </p>
      {authError ? (
        <a className="admin-primary" href="/api/auth/discord?returnTo=/dashboard">Entrar novamente</a>
      ) : !permissionError ? (
        <button className="admin-primary" type="button" onClick={onRetry}>Tentar novamente</button>
      ) : null}
    </section>
  );
}

function captureContent(
  status: CampaignSessionCaptureStatus,
  worldStatus: "online" | "offline" | "revoked",
): Readonly<{ label: string; description: string }> {
  if (status === "starting") return { label: "Iniciando captura", description: "O portal está preparando o registro deste mundo." };
  if (status === "capturing") return { label: "Capturando agora", description: "Mensagens públicas do Foundry estão chegando à sessão." };
  if (status === "ended") return { label: "Captura encerrada", description: "Nenhum novo evento será acrescentado automaticamente." };
  if (status === "cancelled") return { label: "Captura cancelada", description: "Os registros anteriores continuam preservados." };
  if (status === "interrupted") return { label: "Captura interrompida", description: worldStatus === "revoked" ? "A conexão do mundo foi revogada. Reconecte-o em Mundos do Foundry." : "O Foundry perdeu contato. Os registros já recebidos foram preservados." };
  if (status === "failed") return { label: "Falha ao receber registros", description: "Tente iniciar a captura novamente ou encerre usando as fontes disponíveis." };
  if (status === "not_configured") return { label: "Sem captura automática", description: "Esta sessão depende de notas manuais." };
  return worldStatus === "offline"
    ? { label: "Aguardando o Foundry", description: "A captura começará quando este mundo voltar a ficar online." }
    : { label: "Nenhum registro recebido ainda", description: "O mundo está disponível, mas ainda não enviou uma mensagem pública." };
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
