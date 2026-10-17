"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMissionInput,
  CurrentUserResponse,
  MissionListResponse,
  MissionOutcome,
  MissionStatus,
  MissionSummary,
  RavenListResponse,
  UpdateMissionInput,
} from "@ordem/contracts";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ImagePicker } from "@/components/media/image-picker";
import {
  missionNumberLabel,
  outcomeLabels,
  outcomeTone,
  riskLabels,
} from "@/components/missions/mission-presentation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, RowActions } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { formatDateTime, normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelLoading, PermissionNote, SearchField } from "./kit";
import { MissionDiscordDialog } from "./mission-discord-dialog";
import { MissionImportDialog } from "./mission-import-dialog";
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
  const [editor, setEditor] = useState<{ mission: MissionSummary | null; mode: FormMode } | null>(null);
  const [recording, setRecording] = useState<MissionSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [archiving, setArchiving] = useState<MissionSummary | null>(null);
  const [discord, setDiscord] = useState<MissionSummary | null>(null);
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
        title: "id" in payload ? "Missão atualizada" : mission.outcome ? "Missão registrada" : "Rascunho criado",
        description: mission.outcome && !("id" in payload) ? `${mission.title} já está no registro público.` : mission.title,
      });
      await invalidateMissions(queryClient, campaignId);
    },
  });
  const record = useMutation({
    mutationFn: async ({ mission, ravenIds, ...body }: { mission: MissionSummary; ravenIds: string[] } & RecordFields) => {
      const updated = await apiFetch<MissionSummary>(`/api/missions/${mission.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, version: mission.version }),
      });
      const before = mission.participants.map((participant) => participant.id).sort().join();
      if (before === [...ravenIds].sort().join()) return updated;
      return apiFetch<MissionSummary>(`/api/missions/${mission.id}/participants`, {
        method: "PUT",
        body: JSON.stringify({ ravenIds }),
      });
    },
    onSuccess: async (mission) => {
      setRecording(null);
      toast({
        title: mission.outcome ? "Registro atualizado" : "Missão de volta ao quadro",
        description: mission.outcome
          ? `${mission.title}: ${outcomeLabels[mission.outcome].toLowerCase()}.`
          : `${mission.title} voltou a aceitar inscrições.`,
      });
      await Promise.all([
        invalidateMissions(queryClient, campaignId),
        // Participantes mudam as contagens do Registro dos Corvos.
        queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId, "ravens"] }),
      ]);
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
        <div className="flex flex-wrap gap-2">
          {canPublish ? (
            <Button
              onClick={(event) => {
                remember(event);
                setImporting(true);
              }}
            >
              Importar do Discord
            </Button>
          ) : null}
          {canCreate && canPublish ? (
            <Button
              onClick={(event) => {
                remember(event);
                save.reset();
                setEditor({ mission: null, mode: "record" });
              }}
            >
              Registrar missão antiga
            </Button>
          ) : null}
          {canCreate ? (
            <Button
              variant="accent"
              onClick={(event) => {
                remember(event);
                save.reset();
                setEditor({ mission: null, mode: "call" });
              }}
            >
              Nova missão
            </Button>
          ) : null}
        </div>
      </div>
      <FilterChips
        label="Filtrar missões por situação"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "active", label: "Ativas", count: data.filter((mission) => mission.status !== "archived").length },
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
          action={canCreate ? <Button variant="accent" onClick={() => setEditor({ mission: null, mode: "call" })}>Criar a primeira missão</Button> : null}
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
              cell: (mission) => (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={editorialTone[mission.status]}>{statusLabels[mission.status]}</Badge>
                  {mission.outcome ? (
                    <>
                      <Badge tone={outcomeTone[mission.outcome]}>{outcomeLabels[mission.outcome]}</Badge>
                      {mission.number !== null ? (
                        <span className="w-full text-xs text-fg-subtle">{missionNumberLabel(mission.number)}</span>
                      ) : null}
                    </>
                  ) : mission.status === "published" ? (
                    <span className="text-xs text-fg-subtle">Chamado aberto</span>
                  ) : null}
                </div>
              ),
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
                    <Button size="sm" variant="ghost" onClick={(event) => { remember(event); save.reset(); setEditor({ mission, mode: "call" }); }}>
                      Editar
                    </Button>
                  ) : null}
                  {mission.status === "published" && canPublish ? (
                    <Button size="sm" variant={mission.outcome ? "ghost" : "secondary"} onClick={(event) => { remember(event); record.reset(); setRecording(mission); }}>
                      {mission.outcome ? "Atualizar registro" : "Registrar"}
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
                  {mission.status === "published" && canPublish ? (
                    <Button size="sm" variant="ghost" onClick={(event) => { remember(event); setDiscord(mission); }}>
                      {mission.discordThreadId ? "Ver no Discord" : "Publicar no Discord"}
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
        title={editor?.mission ? "Editar missão" : editor?.mode === "record" ? "Registrar missão antiga" : "Nova missão"}
        description={
          editor?.mission
            ? editor.mission.title
            : editor?.mode === "record"
              ? "Para missões que já aconteceram. Ela entra direto no registro público, sem passar pelo quadro de inscrições."
              : "O chamado começa como rascunho e passa por revisão antes de ser publicado."
        }
        returnFocusRef={triggerRef}
      >
        {editor ? (
          <MissionForm
            key={editor.mission?.id ?? `new-${editor.mode}`}
            campaignId={campaignId}
            mission={editor.mission}
            mode={editor.mode}
            busy={save.isPending}
            error={save.isError ? errorMessage(save.error) : null}
            onCancel={() => setEditor(null)}
            onSubmit={(payload) => save.mutate(payload)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(recording)}
        onOpenChange={(next) => {
          if (!next && !record.isPending) setRecording(null);
        }}
        title="Registro da missão"
        description={recording ? `${recording.title}. O registro aparece na hora para todos, em Registro de missões.` : undefined}
        returnFocusRef={triggerRef}
      >
        {recording ? (
          <RecordForm
            key={recording.id}
            campaignId={campaignId}
            mission={recording}
            busy={record.isPending}
            error={record.isError ? errorMessage(record.error) : null}
            onCancel={() => setRecording(null)}
            onSubmit={(value) => record.mutate({ mission: recording, ...value })}
          />
        ) : null}
      </Dialog>

      <MissionImportDialog
        campaignId={campaignId}
        open={importing}
        returnFocusRef={triggerRef}
        onClose={() => setImporting(false)}
        onImported={() => invalidateMissions(queryClient, campaignId)}
      />

      <MissionDiscordDialog
        campaignId={campaignId}
        mission={discord}
        returnFocusRef={triggerRef}
        onClose={() => setDiscord(null)}
        onPublished={async (updated) => {
          setDiscord(updated);
          toast({ title: "Missão publicada no Discord", tone: "success" });
          await invalidateMissions(queryClient, campaignId);
        }}
      />
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

type FormMode = "call" | "record";

/** Leva o foco ao erro do formulário assim que ele aparece. */
function useFocusOnError(error: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  return ref;
}

type RecordFields = Readonly<{ number: number | null; outcome: MissionOutcome | null; report: string }>;

/** Lê número, situação e relato do formulário; número vazio = sem número. */
function readRecordFields(data: FormData): RecordFields {
  const number = String(data.get("number") ?? "").trim();
  const outcome = String(data.get("outcome") ?? "");
  return {
    number: number ? Number(number) : null,
    outcome: outcome ? (outcome as MissionOutcome) : null,
    report: String(data.get("report") ?? "").trim(),
  };
}

function MissionForm({
  campaignId,
  mission,
  mode,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  campaignId: string;
  mission: MissionSummary | null;
  /** `record`: missão antiga, criada direto no registro. */
  mode: FormMode;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: CreateMissionInput | (UpdateMissionInput & { id: string })) => void;
}>) {
  const [cover, setCover] = useState<string[]>(mission?.coverMediaId ? [mission.coverMediaId] : []);
  const [uploading, setUploading] = useState(false);
  const recording = mode === "record" && !mission;
  const errorRef = useFocusOnError(error);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const scheduled = String(data.get("scheduledFor") ?? "");
    const duration = String(data.get("estimatedDuration") ?? "").trim();
    const fields = {
      title: String(data.get("title")),
      summary: String(data.get("summary")),
      region: String(data.get("region")),
      risk: String(data.get("risk")) as CreateMissionInput["risk"],
      scheduledFor: scheduled ? new Date(scheduled).toISOString() : null,
      partySize: recording ? 5 : Number(data.get("partySize")),
      coverMediaId: cover[0] ?? null,
      estimatedDuration: duration || null,
    };
    if (mission) {
      onSubmit({ ...fields, id: mission.id, version: mission.version });
      return;
    }
    const record = recording ? readRecordFields(data) : { number: null, outcome: null, report: "" };
    onSubmit({ ...fields, ...record, campaignId });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <FormGrid>
        <Field label={recording ? "Nome da missão" : "Título"} className={recording ? undefined : "full"}>
          {({ id }) => <Input id={id} name="title" defaultValue={mission?.title} required minLength={3} maxLength={100} />}
        </Field>
        {recording ? <NumberField defaultValue={null} /> : null}
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
        {recording ? (
          <OutcomeField defaultValue="completed" allowOpenCall={false} />
        ) : (
          <>
            <Field label="Partida" optional>
              {({ id }) => <Input id={id} name="scheduledFor" type="datetime-local" defaultValue={toLocalInput(mission?.scheduledFor)} />}
            </Field>
            <Field label="Vagas">
              {({ id }) => <Input id={id} name="partySize" type="number" min={1} max={12} defaultValue={mission?.partySize ?? 5} required />}
            </Field>
          </>
        )}
        <Field label="Duração estimada" optional hint="Como no chamado do Discord, por exemplo: 1-3 sessões.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="estimatedDuration"
              maxLength={60}
              defaultValue={mission?.estimatedDuration ?? ""}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field
          label={recording ? "Chamado" : "Descrição"}
          className="full"
          hint={
            recording
              ? "O texto do chamado original, em até 1.200 caracteres. Aparece no topo da página da missão."
              : "Até 1.200 caracteres. Aparece no quadro e na página do chamado."
          }
        >
          {({ id, describedBy }) => (
            <Textarea id={id} name="summary" rows={recording ? 4 : 7} maxLength={1_200} defaultValue={mission?.summary} required aria-describedby={describedBy} />
          )}
        </Field>
        {recording ? <ReportField defaultValue="" /> : null}
        <div className="full">
          <ImagePicker
            campaignId={campaignId}
            label="Capa"
            hint={recording ? "Aparece no registro e na página da missão." : "Aparece no quadro de missões, na página do chamado e no post do Discord."}
            value={cover}
            onChange={setCover}
            onBusyChange={setUploading}
          />
        </div>
      </FormGrid>
      {error ? <Notice ref={errorRef} tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy || uploading}>
          {busy ? "Salvando…" : uploading ? "Aguarde o envio…" : mission ? "Salvar alterações" : recording ? "Salvar no registro" : "Criar rascunho"}
        </Button>
      </div>
    </form>
  );
}

/** Número, situação e relato de uma missão publicada. */
function RecordForm({
  campaignId,
  mission,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  campaignId: string;
  mission: MissionSummary;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: RecordFields & { ravenIds: string[] }) => void;
}>) {
  const errorRef = useFocusOnError(error);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({ ...readRecordFields(data), ravenIds: data.getAll("participant").map(String) });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <FormGrid>
        <OutcomeField defaultValue={mission.outcome ?? "in_progress"} allowOpenCall />
        <NumberField defaultValue={mission.number} />
        <ReportField defaultValue={mission.report} />
        <ParticipantsField campaignId={campaignId} current={mission.participants} />
      </FormGrid>
      {error ? <Notice ref={errorRef} tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar registro"}
        </Button>
      </div>
    </form>
  );
}

/** Corvos que participaram: os do registro público e os já marcados (mesmo ocultos). */
function ParticipantsField({
  campaignId,
  current,
}: Readonly<{ campaignId: string; current: MissionSummary["participants"] }>) {
  const ravens = useQuery({
    queryKey: queryKeys.ravens(campaignId),
    queryFn: () => apiFetch<RavenListResponse>(`/api/campaigns/${campaignId}/ravens`),
  });
  const [search, setSearch] = useState("");
  const chosen = new Set(current.map((participant) => participant.id));
  const options = [
    ...current.filter((participant) => !ravens.data?.data.some((raven) => raven.id === participant.id)),
    ...(ravens.data?.data ?? []).map((raven) => ({ id: raven.id, name: raven.name })),
  ];
  const term = normalizeSearch(search);
  const legendId = useId();

  return (
    <fieldset className="full space-y-3" aria-describedby={`${legendId}-hint`}>
      <legend className="text-sm font-semibold text-fg">
        Corvos que participaram <span className="text-xs font-normal text-fg-subtle">opcional</span>
      </legend>
      <p id={`${legendId}-hint`} className="text-xs text-fg-subtle">
        Contam nas missões concluídas e fracassadas, nas sessões jogadas e na última missão de cada Corvo.
      </p>
      {ravens.isPending ? (
        <p className="text-sm text-fg-muted" role="status">Carregando os Corvos…</p>
      ) : ravens.isError ? (
        <Notice tone="warning">Não foi possível carregar os Corvos: {errorMessage(ravens.error)}</Notice>
      ) : options.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhum Corvo no registro ainda. Vincule personagens ou cadastre Corvos no Registro dos Corvos.</p>
      ) : (
        <>
          {options.length > 8 ? (
            <SearchField label="Buscar Corvo" value={search} onChange={setSearch} placeholder="Nome do Corvo" />
          ) : null}
          <ul className="grid gap-1 sm:grid-cols-2">
            {options.map((option) => (
              <li key={option.id} hidden={Boolean(term) && !normalizeSearch(option.name).includes(term)}>
                <Checkbox name="participant" value={option.id} defaultChecked={chosen.has(option.id)} label={option.name} />
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}

function OutcomeField({
  defaultValue,
  allowOpenCall,
}: Readonly<{ defaultValue: MissionOutcome; allowOpenCall: boolean }>) {
  return (
    <Field
      label="Situação no registro"
      hint={allowOpenCall ? "Em andamento tira a missão do quadro e encerra as inscrições." : undefined}
    >
      {({ id, describedBy }) => (
        <Select id={id} name="outcome" defaultValue={defaultValue} aria-describedby={describedBy}>
          {allowOpenCall ? <option value="">Chamado aberto (aceita inscrições)</option> : null}
          <option value="in_progress">{outcomeLabels.in_progress}</option>
          <option value="completed">{outcomeLabels.completed}</option>
          <option value="failed">{outcomeLabels.failed}</option>
        </Select>
      )}
    </Field>
  );
}

function NumberField({ defaultValue }: Readonly<{ defaultValue: number | null }>) {
  return (
    <Field label="Número" optional hint="Missão N° 001. Cada número aparece uma vez no registro.">
      {({ id, describedBy }) => (
        <Input
          id={id}
          name="number"
          type="number"
          inputMode="numeric"
          min={1}
          max={9_999}
          defaultValue={defaultValue ?? ""}
          aria-describedby={describedBy}
        />
      )}
    </Field>
  );
}

function ReportField({ defaultValue }: Readonly<{ defaultValue: string }>) {
  return (
    <Field
      label="Relato"
      optional
      className="full"
      hint="O que aconteceu na aventura, como nas crônicas: parágrafos separados por linha em branco, **negrito** e *itálico*."
    >
      {({ id, describedBy }) => (
        <Textarea id={id} name="report" rows={8} maxLength={20_000} defaultValue={defaultValue} aria-describedby={describedBy} />
      )}
    </Field>
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
