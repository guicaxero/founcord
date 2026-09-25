"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMissionInput,
  CurrentUserResponse,
  MissionListResponse,
  MissionStatus,
  MissionSummary,
  UpdateMissionInput,
} from "@ordem/contracts";
import { useRef, useState, type FormEvent } from "react";
import { riskLabels } from "@/components/missions/mission-presentation";
import { Button } from "@/components/ui/button";
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
import { formatDateTime, normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelLoading, PermissionNote, SearchField } from "./kit";
import { editorialOrder, editorialTone, timestamp } from "./status";

const statusLabels: Readonly<Record<MissionStatus, string>> = {
  draft: "Rascunho",
  pending_review: "Em revisão",
  approved: "Aprovada",
  published: "Publicada",
  archived: "Arquivada",
  rejected: "Rejeitada",
};

const transitionToast: Partial<Record<MissionStatus, string>> = {
  pending_review: "Missão enviada à revisão",
  approved: "Missão aprovada",
  rejected: "Missão rejeitada",
  published: "Missão publicada no quadro",
};

type Filter = "active" | "all" | MissionStatus;

export function MissionsPanel({
  campaignId,
  me,
}: Readonly<{ campaignId: string; me: CurrentUserResponse }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const triggerRef = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<{ mission: MissionSummary | null } | null>(null);
  const [archiving, setArchiving] = useState<MissionSummary | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const missions = useQuery({
    queryKey: queryKeys.missions(campaignId, "editorial"),
    queryFn: () => apiFetch<MissionListResponse>(`/api/campaigns/${campaignId}/missions?scope=editorial`),
  });
  const save = useMutation({
    mutationFn: (payload: CreateMissionInput | (UpdateMissionInput & { id: string })) => {
      if ("id" in payload) {
        const { id, ...body } = payload;
        return apiFetch<MissionSummary>(`/api/missions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiFetch<MissionSummary>(`/api/campaigns/${campaignId}/missions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (mission, payload) => {
      setEditor(null);
      toast({
        title: "id" in payload ? "Missão atualizada" : "Rascunho criado",
        description: mission.title,
      });
      await invalidateMissions(queryClient, campaignId);
    },
  });
  const transition = useMutation({
    mutationFn: ({ mission, status }: { mission: MissionSummary; status: MissionStatus }) =>
      apiFetch<MissionSummary>(`/api/missions/${mission.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: mission.version, status }),
      }),
    onSuccess: async (mission) => {
      toast({ title: transitionToast[mission.status] ?? "Missão atualizada", description: mission.title });
      await invalidateMissions(queryClient, campaignId);
    },
    onError: (error) => toast({ title: "A missão não foi alterada", description: errorMessage(error), tone: "danger" }),
  });
  const archive = useMutation({
    mutationFn: (mission: MissionSummary) =>
      apiFetch<void>(`/api/missions/${mission.id}?version=${mission.version}`, { method: "DELETE" }),
    onSuccess: async (_, mission) => {
      setArchiving(null);
      toast({ title: "Missão arquivada", description: `${mission.title} saiu do quadro público.` });
      await invalidateMissions(queryClient, campaignId);
    },
  });

  const canCreate = hasCapability(me, "mission:create", campaignId);
  const canEdit = hasCapability(me, "mission:edit", campaignId);
  const canReview = hasCapability(me, "mission:review", campaignId);
  const canPublish = hasCapability(me, "mission:publish", campaignId);
  const editable = (mission: MissionSummary) =>
    canEdit && (mission.authorUserId === me.user?.id || canReview || canPublish);

  if (missions.isPending) return <PanelLoading label="Consultando os chamados" />;
  if (missions.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar as missões"
        tone="error"
        role="alert"
        action={<Button onClick={() => missions.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(missions.error)}
      </FeedbackState>
    );
  }

  const data = missions.data.data;
  const query = normalizeSearch(search);
  const visible = data.filter((mission) => {
    const matchesFilter =
      filter === "all" ? true : filter === "active" ? mission.status !== "archived" : mission.status === filter;
    return matchesFilter && (!query || normalizeSearch(`${mission.title} ${mission.region}`).includes(query));
  });
  const count = (status: MissionStatus) => data.filter((mission) => mission.status === status).length;

  function remember(event: { currentTarget: HTMLElement }) {
    triggerRef.current = event.currentTarget;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SearchField label="Buscar missão" value={search} onChange={setSearch} placeholder="Título ou região" className="max-w-md" />
        {canCreate ? (
          <Button
            variant="accent"
            onClick={(event) => {
              remember(event);
              save.reset();
              setEditor({ mission: null });
            }}
          >
            Nova missão
          </Button>
        ) : null}
      </div>
      <FilterChips
        label="Filtrar missões por situação"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "active", label: "Em andamento", count: data.filter((mission) => mission.status !== "archived").length },
          { value: "pending_review", label: "Em revisão", count: count("pending_review") },
          { value: "approved", label: "Aprovadas", count: count("approved") },
          { value: "published", label: "Publicadas", count: count("published") },
          { value: "archived", label: "Arquivadas", count: count("archived") },
          { value: "all", label: "Todas", count: data.length },
        ]}
      />
      {!canCreate ? <PermissionNote>Seu perfil acompanha e revisa o fluxo, mas não cria missões.</PermissionNote> : null}

      {data.length === 0 ? (
        <FeedbackState
          title="Nenhuma missão ainda"
          action={canCreate ? <Button variant="accent" onClick={() => setEditor({ mission: null })}>Criar a primeira missão</Button> : null}
        >
          Missões criadas aqui passam por revisão antes de aparecer no quadro público.
        </FeedbackState>
      ) : (
        <DataTable
          caption="Missões da campanha"
          rows={visible}
          rowKey={(mission) => mission.id}
          initialSort={{ column: "status", direction: "ascending" }}
          empty={
            <FeedbackState title="Nenhuma missão neste filtro" action={<Button onClick={() => { setFilter("all"); setSearch(""); }}>Mostrar todas</Button>}>
              Ajuste a busca ou escolha outra situação.
            </FeedbackState>
          }
          columns={[
            {
              id: "title",
              header: "Missão",
              hideLabelOnMobile: true,
              sortValue: (mission) => mission.title,
              cell: (mission) => (
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-fg">{mission.title}</p>
                  <p className="text-xs text-fg-subtle">{mission.region} · {riskLabels[mission.risk]} · por {mission.authorName}</p>
                </div>
              ),
            },
            {
              id: "status",
              header: "Situação",
              sortValue: (mission) => editorialOrder[mission.status],
              className: "md:w-36",
              cell: (mission) => <Badge tone={editorialTone[mission.status]}>{statusLabels[mission.status]}</Badge>,
            },
            {
              id: "party",
              header: "Companhia",
              sortValue: (mission) => mission.signupCount,
              className: "md:w-32 tabular-nums text-fg-muted",
              cell: (mission) => `${mission.signupCount}/${mission.partySize}${mission.waitlistCount ? ` +${mission.waitlistCount}` : ""}`,
            },
            {
              id: "date",
              header: "Partida",
              sortValue: (mission) => timestamp(mission.scheduledFor),
              className: "md:w-44 text-fg-muted",
              cell: (mission) => formatDateTime(mission.scheduledFor, "A definir"),
            },
            {
              id: "actions",
              header: "Ações",
              hideLabelOnMobile: true,
              className: "lg:w-72",
              cell: (mission) => (
                <RowActions>
                  {editable(mission) && mission.status !== "archived" ? (
                    <Button size="sm" variant="ghost" onClick={(event) => { remember(event); save.reset(); setEditor({ mission }); }}>
                      Editar
                    </Button>
                  ) : null}
                  {(mission.status === "draft" || mission.status === "rejected") && editable(mission) ? (
                    <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ mission, status: "pending_review" })}>
                      Enviar à revisão
                    </Button>
                  ) : null}
                  {mission.status === "pending_review" && canReview ? (
                    <>
                      <Button size="sm" variant="primary" disabled={transition.isPending} onClick={() => transition.mutate({ mission, status: "approved" })}>
                        Aprovar
                      </Button>
                      <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ mission, status: "rejected" })}>
                        Rejeitar
                      </Button>
                    </>
                  ) : null}
                  {mission.status === "approved" && canPublish ? (
                    <Button size="sm" variant="primary" disabled={transition.isPending} onClick={() => transition.mutate({ mission, status: "published" })}>
                      Publicar
                    </Button>
                  ) : null}
                  {mission.status !== "archived" && editable(mission) ? (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={(event) => { remember(event); archive.reset(); setArchiving(mission); }}>
                      Arquivar
                    </Button>
                  ) : null}
                </RowActions>
              ),
            },
          ]}
        />
      )}

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(next) => {
          if (!next && !save.isPending) setEditor(null);
        }}
        title={editor?.mission ? "Editar missão" : "Nova missão"}
        description={editor?.mission ? editor.mission.title : "O chamado começa como rascunho e passa por revisão antes de ser publicado."}
        returnFocusRef={triggerRef}
      >
        {editor ? (
          <MissionForm
            key={editor.mission?.id ?? "new"}
            campaignId={campaignId}
            mission={editor.mission}
            busy={save.isPending}
            error={save.isError ? errorMessage(save.error) : null}
            onCancel={() => setEditor(null)}
            onSubmit={(payload) => save.mutate(payload)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Arquivar missão?"
        description={archiving ? `“${archiving.title}” sai do quadro público e das listas de inscrição.` : undefined}
        confirmLabel="Arquivar missão"
        busyLabel="Arquivando…"
        busy={archive.isPending}
        error={archive.isError ? errorMessage(archive.error) : null}
        onCancel={() => setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving)}
        returnFocusRef={triggerRef}
      >
        <p>As inscrições registradas continuam no histórico da campanha.</p>
      </ConfirmDialog>
    </div>
  );
}

function MissionForm({
  campaignId,
  mission,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  campaignId: string;
  mission: MissionSummary | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: CreateMissionInput | (UpdateMissionInput & { id: string })) => void;
}>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const scheduled = String(data.get("scheduledFor") ?? "");
    const fields = {
      title: String(data.get("title")),
      summary: String(data.get("summary")),
      region: String(data.get("region")),
      risk: String(data.get("risk")) as CreateMissionInput["risk"],
      scheduledFor: scheduled ? new Date(scheduled).toISOString() : null,
      partySize: Number(data.get("partySize")),
    };
    onSubmit(mission ? { ...fields, id: mission.id, version: mission.version } : { ...fields, campaignId });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <FormGrid>
        <Field label="Título" className="full">
          {({ id }) => <Input id={id} name="title" defaultValue={mission?.title} required minLength={3} maxLength={100} />}
        </Field>
        <Field label="Região">
          {({ id }) => <Input id={id} name="region" defaultValue={mission?.region} required maxLength={80} />}
        </Field>
        <Field label="Risco">
          {({ id }) => (
            <Select id={id} name="risk" defaultValue={mission?.risk ?? "unknown"}>
              <option value="unknown">Desconhecido</option>
              <option value="moderate">Moderado</option>
              <option value="dangerous">Perigoso</option>
              <option value="deadly">Letal</option>
            </Select>
          )}
        </Field>
        <Field label="Partida" optional>
          {({ id }) => <Input id={id} name="scheduledFor" type="datetime-local" defaultValue={toLocalInput(mission?.scheduledFor)} />}
        </Field>
        <Field label="Vagas">
          {({ id }) => <Input id={id} name="partySize" type="number" min={1} max={12} defaultValue={mission?.partySize ?? 5} required />}
        </Field>
        <Field label="Descrição" className="full" hint="Até 1.200 caracteres. Aparece no quadro e na página do chamado.">
          {({ id, describedBy }) => (
            <Textarea id={id} name="summary" rows={7} maxLength={1_200} defaultValue={mission?.summary} required aria-describedby={describedBy} />
          )}
        </Field>
      </FormGrid>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Salvando…" : mission ? "Salvar alterações" : "Criar rascunho"}
        </Button>
      </div>
    </form>
  );
}

async function invalidateMissions(queryClient: ReturnType<typeof useQueryClient>, campaignId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.missions(campaignId, "editorial") }),
    queryClient.invalidateQueries({ queryKey: queryKeys.missions(campaignId) }),
  ]);
}

function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
