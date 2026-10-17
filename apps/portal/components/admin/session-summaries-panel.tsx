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
} from "@ordem/contracts";
import { useRef, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, RowActions } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelLoading, PermissionNote } from "./kit";
import { editorialOrder, editorialTone, timestamp } from "./status";

const statusLabels: Readonly<Record<SessionSummaryStatus, string>> = {
  draft: "Rascunho",
  pending_review: "Em revisão",
  published: "Publicado",
  archived: "Arquivado",
};

const transitionNotice: Readonly<Record<SessionSummaryStatus, string>> = {
  draft: "Resumo devolvido ao rascunho e fora da leitura pública.",
  pending_review: "Resumo enviado para revisão; ele continua privado.",
  published: "Resumo publicado no Diário de Sessões.",
  archived: "Resumo arquivado e fora da leitura pública.",
};

const sessionStatusLabels: Readonly<Record<CampaignSessionListResponse["data"][number]["status"], string>> = {
  prepared: "preparada",
  starting: "iniciando",
  active: "em andamento",
  ended: "encerrada",
  cancelled: "cancelada",
  capture_failed: "captura interrompida",
};

type SummaryFilter = "all" | SessionSummaryStatus;

export function SessionSummariesPanel({
  campaignId,
  me,
  initialSummaries,
  initialSessions,
  openToPlayers,
  settingsHref,
}: Readonly<{
  campaignId: string;
  me: CurrentUserResponse;
  /** O Diário está aberto aos jogadores; fechado, só a gestão o lê. */
  openToPlayers: boolean;
  /** Configurações da campanha, onde o Diário é aberto ou fechado. */
  settingsHref: string;
  initialSummaries?: SessionSummaryListResponse | undefined;
  initialSessions?: CampaignSessionListResponse | undefined;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const triggerRef = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<{ item: SessionSummary | null } | null>(null);
  const [deleting, setDeleting] = useState<SessionSummary | null>(null);
  const [filter, setFilter] = useState<SummaryFilter>("all");
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
    onSuccess: async (item, payload) => {
      setEditor(null);
      toast({
        title: "id" in payload ? "Alterações salvas" : "Rascunho criado",
        description: "id" in payload ? item.title : "O registro continua privado até ser publicado.",
      });
      await invalidateSummaries(queryClient, campaignId);
    },
  });
  const transition = useMutation({
    mutationFn: ({ item, status }: { item: SessionSummary; status: SessionSummaryStatus }) =>
      apiFetch<SessionSummary>(`/api/campaigns/${campaignId}/session-summaries/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: item.version, status }),
      }),
    onSuccess: (item) => {
      toast({ title: item.title, description: transitionNotice[item.status] });
      return invalidateSummaries(queryClient, campaignId);
    },
    onError: (error) => toast({ title: "O resumo não foi alterado", description: errorMessage(error), tone: "danger" }),
  });
  const destroy = useMutation({
    mutationFn: (item: SessionSummary) =>
      apiFetch<void>(`/api/campaigns/${campaignId}/session-summaries/${item.id}?version=${item.version}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleting(null);
      toast({ title: "Resumo excluído", description: "A sessão original e suas fontes foram preservadas." });
      await invalidateSummaries(queryClient, campaignId);
    },
  });

  const data = summaries.data?.data ?? [];
  const filtered = filter === "all" ? data : data.filter((item) => item.status === filter);
  const canEdit = canManage || canReview;

  function remember(event: { currentTarget: HTMLElement }) {
    triggerRef.current = event.currentTarget;
  }

  return (
    <div className="space-y-6">
      {openToPlayers ? null : (
        <Notice
          title="O Diário está fechado aos jogadores"
          action={<ButtonLink href={settingsHref} variant="secondary" size="sm">Abrir aos jogadores</ButtonLink>}
        >
          Os resumos publicados aqui só aparecem para a gestão até você abrir o Diário nas
          configurações da campanha.
        </Notice>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterChips
          label="Filtrar resumos por estado"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Todos", count: data.length },
            ...(["draft", "pending_review", "published", "archived"] as const).map((value) => ({
              value,
              label: statusLabels[value],
              count: data.filter((item) => item.status === value).length,
            })),
          ]}
        />
        {canManage ? (
          <Button variant="accent" onClick={(event) => { remember(event); save.reset(); setEditor({ item: null }); }}>
            Novo resumo
          </Button>
        ) : null}
      </div>
      {!canManage ? <PermissionNote>Seu perfil revisa ou publica registros existentes, mas não cria novos resumos.</PermissionNote> : null}

      <div aria-live="polite">
        {summaries.isPending ? (
          <PanelLoading label="Reunindo os resumos desta campanha" />
        ) : summaries.isError ? (
          <FeedbackState
            title="Não foi possível carregar o diário"
            tone="error"
            role="alert"
            action={<Button onClick={() => summaries.refetch()}>Tentar novamente</Button>}
          >
            {errorMessage(summaries.error)}
          </FeedbackState>
        ) : data.length === 0 ? (
          <FeedbackState title="Nenhum resumo registrado">
            Resumos gerados pelas sessões ou criados manualmente aparecem aqui.
          </FeedbackState>
        ) : (
          <DataTable
            caption="Resumos de sessão"
            rows={filtered}
            rowKey={(item) => item.id}
            initialSort={{ column: "status", direction: "ascending" }}
            empty={
              <FeedbackState title="Nenhum registro neste filtro" action={<Button onClick={() => setFilter("all")}>Mostrar todos</Button>}>
                Escolha outro estado para continuar acompanhando o diário.
              </FeedbackState>
            }
            columns={[
              {
                id: "title",
                header: "Resumo",
                hideLabelOnMobile: true,
                sortValue: (item) => item.title,
                cell: (item) => (
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold text-fg">{item.title}</p>
                    <p className="text-xs text-fg-subtle">
                      {item.sessionTitle ?? "Sem sessão vinculada"} · {item.authorName} · {item.source === "automation" ? "automação" : "manual"}
                    </p>
                  </div>
                ),
              },
              {
                id: "status",
                header: "Situação",
                sortValue: (item) => editorialOrder[item.status],
                className: "md:w-36",
                cell: (item) => <Badge tone={editorialTone[item.status]}>{statusLabels[item.status]}</Badge>,
              },
              {
                id: "updated",
                header: "Atualizado",
                sortValue: (item) => timestamp(item.updatedAt),
                className: "md:w-36 text-fg-muted",
                cell: (item) => formatDate(item.updatedAt),
              },
              {
                id: "actions",
                header: "Ações",
                hideLabelOnMobile: true,
                className: "lg:w-80",
                cell: (item) => (
                  <RowActions>
                    {(item.status === "draft" || item.status === "pending_review") && canEdit ? (
                      <Button size="sm" variant="ghost" onClick={(event) => { remember(event); save.reset(); setEditor({ item }); }}>
                        Editar
                      </Button>
                    ) : null}
                    {item.status === "draft" && canEdit ? (
                      <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "pending_review" })}>
                        Enviar para revisão
                      </Button>
                    ) : null}
                    {item.status === "pending_review" && canEdit ? (
                      <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "draft" })}>
                        Devolver ao rascunho
                      </Button>
                    ) : null}
                    {item.status === "pending_review" && canPublish ? (
                      <Button size="sm" variant="primary" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "published" })}>
                        Publicar resumo
                      </Button>
                    ) : null}
                    {item.status === "archived" && canPublish ? (
                      <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "draft" })}>
                        Restaurar como rascunho
                      </Button>
                    ) : null}
                    {item.status !== "archived" && canPublish ? (
                      <Button size="sm" variant="ghost" className="text-danger" disabled={transition.isPending} onClick={() => transition.mutate({ item, status: "archived" })}>
                        Arquivar
                      </Button>
                    ) : null}
                    {item.status === "archived" && canDelete ? (
                      <Button size="sm" variant="danger" onClick={(event) => { remember(event); destroy.reset(); setDeleting(item); }}>
                        Excluir permanentemente
                      </Button>
                    ) : null}
                  </RowActions>
                ),
              },
            ]}
          />
        )}
      </div>

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(next) => {
          if (!next && !save.isPending) setEditor(null);
        }}
        title={editor?.item ? "Revisar resumo" : "Novo resumo"}
        description="Nenhum resumo é publicado sem uma ação humana explícita."
        returnFocusRef={triggerRef}
        className="max-w-3xl"
      >
        {editor ? (
          <SummaryForm
            key={editor.item?.id ?? "new"}
            campaignId={campaignId}
            item={editor.item}
            sessions={sessions.data?.data ?? []}
            sessionsUnavailable={sessions.isError}
            busy={save.isPending}
            error={save.isError ? errorMessage(save.error) : null}
            onCancel={() => setEditor(null)}
            onSubmit={(value) => save.mutate(value)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir resumo permanentemente?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir permanentemente"
        busyLabel="Excluindo…"
        confirmationText="EXCLUIR"
        busy={destroy.isPending}
        error={destroy.isError ? errorMessage(destroy.error) : null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && destroy.mutate(deleting)}
        returnFocusRef={triggerRef}
      >
        <p>
          O registro <strong className="text-fg">{deleting?.title}</strong> será removido do portal. A sessão original e
          suas fontes não serão alteradas.
        </p>
      </ConfirmDialog>
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
    <form className="space-y-6" onSubmit={submit}>
      <FormGrid>
        {item ? (
          <div className="full rounded-md bg-surface-2 px-3 py-2 text-sm">
            <span className="block text-xs font-bold text-fg-subtle uppercase">Sessão vinculada</span>
            {item.sessionTitle ?? "Sem sessão vinculada"}
          </div>
        ) : (
          <Field label="Sessão relacionada" className="full" hint="Vincule a expedição quando o registro descrever uma sessão específica.">
            {({ id, describedBy }) => (
              <Select id={id} name="sessionId" defaultValue="" aria-describedby={describedBy}>
                <option value="">Registro manual, sem sessão</option>
                {sessions.map((session) => (
                  <option value={session.id} key={session.id}>
                    {session.title} · {sessionStatusLabels[session.status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {sessionsUnavailable && !item ? (
          <Notice className="full" tone="warning" role="status">
            As sessões não puderam ser carregadas. Você ainda pode salvar o registro sem vínculo.
          </Notice>
        ) : null}
        <Field label="Título" className="full">
          {({ id }) => <Input id={id} name="title" required minLength={3} maxLength={140} defaultValue={item?.title} />}
        </Field>
        <Field label="Resumo" className="full">
          {({ id }) => <Textarea id={id} name="body" required rows={14} maxLength={20_000} defaultValue={item?.body} />}
        </Field>
      </FormGrid>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Salvando…" : item ? "Salvar alterações" : "Salvar rascunho"}
        </Button>
      </div>
    </form>
  );
}

async function invalidateSummaries(queryClient: ReturnType<typeof useQueryClient>, campaignId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionSummaries(campaignId, "editorial") }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessionSummaries(campaignId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.campaignSessions(campaignId) }),
  ]);
}
