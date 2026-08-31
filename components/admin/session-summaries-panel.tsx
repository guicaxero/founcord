"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CampaignSessionListResponse,
  CreateSessionSummaryInput,
  CurrentUserResponse,
  SessionSummary,
  SessionSummaryListResponse,
  SessionSummaryStatus,
  UpdateSessionSummaryInput,
} from "@vigilia/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FeedbackState } from "@/components/ui/feedback-state";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";

const statusLabels: Readonly<Record<SessionSummaryStatus, string>> = {
  draft: "Rascunho",
  pending_review: "Em revisão",
  published: "Publicado",
  archived: "Arquivado",
};

type SummaryFilter = "all" | SessionSummaryStatus;

export function SessionSummariesPanel({
  campaignId,
  me,
  initialSummaries,
  initialSessions,
}: Readonly<{
  campaignId: string;
  me: CurrentUserResponse;
  initialSummaries?: SessionSummaryListResponse;
  initialSessions?: CampaignSessionListResponse;
}>) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState<SessionSummary | null>(null);
  const [filter, setFilter] = useState<SummaryFilter>("all");
  const [notice, setNotice] = useState("");
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const canManage = hasCapability(me, "session:manage", campaignId);
  const canReview = hasCapability(me, "post:review", campaignId);
  const canPublish = hasCapability(me, "post:publish", campaignId);
  const canDelete = hasCapability(me, "post:delete", campaignId);
  const summaries = useQuery({
    queryKey: queryKeys.sessionSummaries(campaignId, "editorial"),
    queryFn: () => apiFetch<SessionSummaryListResponse>(`/api/campaigns/${campaignId}/session-summaries?scope=editorial`),
    initialData: initialSummaries,
    enabled: initialSummaries === undefined,
  });
  const sessions = useQuery({
    queryKey: queryKeys.campaignSessions(campaignId),
    queryFn: () => apiFetch<CampaignSessionListResponse>(`/api/campaigns/${campaignId}/sessions`),
    initialData: initialSessions,
    enabled: canManage && initialSessions === undefined,
  });
  const save = useMutation({
    mutationFn: (payload: CreateSessionSummaryInput | (UpdateSessionSummaryInput & { id: string })) => {
      if ("id" in payload) {
        const { id, ...body } = payload;
        return apiFetch<SessionSummary>(`/api/campaigns/${campaignId}/session-summaries/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiFetch<SessionSummary>(`/api/campaigns/${campaignId}/session-summaries`, { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async (_, payload) => {
      setNotice("id" in payload ? "Alterações salvas no registro." : "Rascunho criado e mantido privado.");
      setEditing(null);
      await invalidateSummaries(queryClient, campaignId);
    },
  });
  const transition = useMutation({
    mutationFn: ({ item, status }: { item: SessionSummary; status: SessionSummaryStatus }) =>
      apiFetch<SessionSummary>(`/api/campaigns/${campaignId}/session-summaries/${item.id}`, { method: "PATCH", body: JSON.stringify({ version: item.version, status }) }),
    onSuccess: (item) => {
      setNotice(transitionNotice(item.status));
      return invalidateSummaries(queryClient, campaignId);
    },
  });
  const destroy = useMutation({
    mutationFn: (item: SessionSummary) => apiFetch<void>(`/api/campaigns/${campaignId}/session-summaries/${item.id}?version=${item.version}`, { method: "DELETE" }),
    onSuccess: async () => {
      closeDeleteDialog();
      setNotice("Resumo excluído permanentemente. A sessão original foi preservada.");
      await invalidateSummaries(queryClient, campaignId);
    },
  });

  const data = summaries.data?.data ?? [];
  const filtered = filter === "all" ? data : data.filter((item) => item.status === filter);

  function closeDeleteDialog() {
    setDeleting(null);
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }

  return (
    <div className="admin-two-column session-summary-admin">
      <div>
        <div className="admin-section-title session-summary-heading">
          <div><span>DIÁRIO DA ORDEM</span><h2>Resumos de sessão</h2><p>Revise registros factuais antes de torná-los públicos.</p></div>
          <b>{data.length} registros</b>
        </div>
        <div className="sessions-filters" aria-label="Filtrar resumos por estado">
          {(["all", "draft", "pending_review", "published", "archived"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {value === "all" ? "Todos" : statusLabels[value]}
            </button>
          ))}
        </div>
        <p className="admin-live-feedback" role="status" aria-live="polite">{notice}</p>
        {summaries.isLoading ? <FeedbackState title="Carregando registros" role="status">Reunindo os resumos desta campanha.</FeedbackState> : null}
        {summaries.isError ? <FeedbackState title="Não foi possível carregar o diário" tone="error" role="alert" action={<button type="button" onClick={() => summaries.refetch()}>Tentar novamente</button>}>{errorMessage(summaries.error)}</FeedbackState> : null}
        {!summaries.isLoading && !summaries.isError && data.length === 0 ? <FeedbackState title="Nenhum resumo registrado">Resumos gerados pelas sessões ou criados manualmente aparecerão aqui.</FeedbackState> : null}
        {!summaries.isLoading && !summaries.isError && data.length > 0 && filtered.length === 0 ? <FeedbackState title="Nenhum registro neste filtro">Escolha outro estado para continuar acompanhando o diário.</FeedbackState> : null}
        <div className="admin-list post-list">
          {filtered.map((item) => (
            <article key={item.id}>
              <div className="admin-list-main">
                <span className={`status-pill status-${item.status}`}>{statusLabels[item.status]}</span>
                <h3>{item.title}</h3>
                <p>{item.sessionTitle ?? "Sem sessão vinculada"} · {item.authorName} · {item.source === "automation" ? "automação" : "manual"}</p>
              </div>
              <div className="admin-row-actions">
                {(item.status === "draft" || item.status === "pending_review") && (canManage || canReview) ? <button type="button" onClick={() => setEditing(item)}>Editar</button> : null}
                {item.status === "draft" && (canManage || canReview) ? <button type="button" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "pending_review" })}>Enviar para revisão</button> : null}
                {item.status === "pending_review" && (canManage || canReview) ? <button type="button" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "draft" })}>Devolver ao rascunho</button> : null}
                {item.status === "pending_review" && canPublish ? <button type="button" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "published" })}>Publicar resumo</button> : null}
                {item.status === "archived" && canPublish ? <button type="button" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "draft" })}>Restaurar como rascunho</button> : null}
                {item.status !== "archived" && canPublish ? <button className="danger-link" type="button" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "archived" })}>Arquivar</button> : null}
                {item.status === "archived" && canDelete ? <button ref={deleteTriggerRef} className="danger-link" type="button" onClick={() => setDeleting(item)}>Excluir permanentemente</button> : null}
              </div>
            </article>
          ))}
        </div>
        {transition.isError ? <p className="inline-error" role="alert">{errorMessage(transition.error)}</p> : null}
      </div>
      {canManage || editing ? <SummaryForm campaignId={campaignId} item={editing} sessions={sessions.data?.data ?? []} sessionsUnavailable={sessions.isError} busy={save.isPending} error={save.isError ? errorMessage(save.error) : null} onCancel={() => setEditing(null)} onSubmit={(value) => save.mutate(value)} /> : <aside className="permission-note">Seu perfil revisa ou publica registros existentes, mas não cria novos resumos.</aside>}
      {deleting ? <DeleteSummaryDialog item={deleting} busy={destroy.isPending} error={destroy.isError ? errorMessage(destroy.error) : null} onCancel={closeDeleteDialog} onConfirm={() => destroy.mutate(deleting)} /> : null}
    </div>
  );
}

function SummaryForm({
  campaignId,
  item,
  sessions,
  sessionsUnavailable,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  campaignId: string;
  item: SessionSummary | null;
  sessions: CampaignSessionListResponse["data"];
  sessionsUnavailable: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: CreateSessionSummaryInput | (UpdateSessionSummaryInput & { id: string })) => void;
}>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = { title: String(data.get("title")), body: String(data.get("body")) };
    const sessionId = String(data.get("sessionId") ?? "") || null;
    onSubmit(item ? { ...fields, id: item.id, version: item.version } : { ...fields, campaignId, sessionId, status: "draft" });
  }
  return (
    <aside className="admin-editor">
      <div className="admin-section-title"><div><span>{item ? "REVISÃO" : "NOVO REGISTRO"}</span><h2>{item ? item.title : "Criar resumo"}</h2></div></div>
      <form className="admin-form" key={item?.id ?? "new"} onSubmit={submit}>
        {item ? (
          <p className="full summary-session-context"><strong>Sessão vinculada</strong><span>{item.sessionTitle ?? "Sem sessão vinculada"}</span></p>
        ) : (
          <label className="full">Sessão relacionada
            <select name="sessionId" defaultValue="" aria-describedby="session-summary-help">
              <option value="">Registro manual, sem sessão</option>
              {sessions.map((session) => <option value={session.id} key={session.id}>{session.title} · {statusLabelsForSession(session.status)}</option>)}
            </select>
            <small id="session-summary-help">Vincule a expedição quando o registro descrever uma sessão específica.</small>
          </label>
        )}
        {sessionsUnavailable && !item ? <p className="inline-error full" role="alert">As sessões não puderam ser carregadas. Você ainda pode salvar o registro sem vínculo.</p> : null}
        <label className="full">Título<input name="title" required minLength={3} maxLength={140} defaultValue={item?.title} /></label>
        <label className="full">Resumo<textarea name="body" required rows={14} maxLength={20_000} defaultValue={item?.body} /></label>
        <div className="form-actions full"><button className="admin-primary" disabled={busy}>{busy ? "Salvando…" : item ? "Salvar alterações" : "Salvar rascunho"}</button>{item ? <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button> : null}</div>
      </form>
      <p className="editorial-note">Nenhum resumo é publicado sem uma ação humana explícita.</p>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
    </aside>
  );
}

function DeleteSummaryDialog({ item, busy, error, onCancel, onConfirm }: Readonly<{ item: SessionSummary; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => { const dialog = dialogRef.current; if (dialog && !dialog.open) { dialog.showModal(); confirmationRef.current?.focus(); } return () => { if (dialog?.open) dialog.close(); }; }, []);
  return (
    <dialog ref={dialogRef} className="destructive-dialog" aria-labelledby="delete-summary-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
      <form className="destructive-dialog-card" onSubmit={(event) => { event.preventDefault(); if (confirmation === "EXCLUIR" && !busy) onConfirm(); }}>
        <span className="dialog-kicker">AÇÃO IRREVERSÍVEL</span><h2 id="delete-summary-title">Excluir resumo permanentemente?</h2>
        <p>O registro <strong>{item.title}</strong> será removido do portal. A sessão original e suas fontes não serão alteradas.</p>
        <label>Digite <strong>EXCLUIR</strong> para confirmar<input ref={confirmationRef} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} /></label>
        {error ? <p className="inline-error" role="alert">{error}</p> : null}
        <div className="dialog-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="danger-primary" disabled={confirmation !== "EXCLUIR" || busy}>{busy ? "Excluindo…" : "Excluir permanentemente"}</button></div>
      </form>
    </dialog>
  );
}

async function invalidateSummaries(queryClient: ReturnType<typeof useQueryClient>, campaignId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionSummaries(campaignId, "editorial") }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionSummaries(campaignId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.campaignSessions(campaignId) }),
  ]);
}

function transitionNotice(status: SessionSummaryStatus): string {
  const messages: Readonly<Record<SessionSummaryStatus, string>> = {
    draft: "Resumo devolvido ao rascunho e removido da leitura pública.",
    pending_review: "Resumo enviado para revisão; ele continua privado.",
    published: "Resumo publicado no Diário de Sessões.",
    archived: "Resumo arquivado e removido da leitura pública.",
  };
  return messages[status];
}

function statusLabelsForSession(status: CampaignSessionListResponse["data"][number]["status"]): string {
  const labels: Readonly<Record<CampaignSessionListResponse["data"][number]["status"], string>> = {
    prepared: "preparada",
    starting: "iniciando",
    active: "em andamento",
    ended: "encerrada",
    cancelled: "cancelada",
    capture_failed: "captura interrompida",
  };
  return labels[status];
}
