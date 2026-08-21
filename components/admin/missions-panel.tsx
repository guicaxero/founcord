"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMissionInput,
  CurrentUserResponse,
  MissionListResponse,
  MissionStatus,
  MissionSummary,
  UpdateMissionInput,
} from "@vigilia/contracts";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";

const statusLabels: Readonly<Record<MissionStatus, string>> = {
  draft: "Rascunho",
  pending_review: "Em revisão",
  approved: "Aprovada",
  published: "Publicada",
  archived: "Arquivada",
  rejected: "Rejeitada",
};

export function MissionsPanel({
  campaignId,
  me,
}: Readonly<{ campaignId: string; me: CurrentUserResponse }>) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MissionSummary | null>(null);
  const missions = useQuery({
    queryKey: queryKeys.missions(campaignId, "editorial"),
    queryFn: () =>
      apiFetch<MissionListResponse>(
        `/api/campaigns/${campaignId}/missions?scope=editorial`,
      ),
  });
  const save = useMutation({
    mutationFn: (payload: CreateMissionInput | (UpdateMissionInput & { id: string })) => {
      if ("id" in payload) {
        const { id, ...body } = payload;
        return apiFetch<MissionSummary>(`/api/missions/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiFetch<MissionSummary>(`/api/campaigns/${campaignId}/missions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await invalidateMissions(queryClient, campaignId);
    },
  });
  const transition = useMutation({
    mutationFn: ({ mission, status }: { mission: MissionSummary; status: MissionStatus }) =>
      apiFetch<MissionSummary>(`/api/missions/${mission.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: mission.version, status }),
      }),
    onSuccess: () => invalidateMissions(queryClient, campaignId),
  });
  const archive = useMutation({
    mutationFn: (mission: MissionSummary) =>
      apiFetch<void>(`/api/missions/${mission.id}?version=${mission.version}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateMissions(queryClient, campaignId),
  });

  const canCreate = hasCapability(me, "mission:create", campaignId);
  const canReview = hasCapability(me, "mission:review", campaignId);
  const canPublish = hasCapability(me, "mission:publish", campaignId);

  return (
    <div className="admin-two-column">
      <div>
        <div className="admin-section-title">
          <div><span>QUADRO EDITORIAL</span><h2>Missões</h2></div>
          <b>{missions.data?.data.length ?? 0} registros</b>
        </div>
        {missions.isLoading ? <p>Consultando os chamados…</p> : null}
        {missions.isError ? <p className="inline-error">{errorMessage(missions.error)}</p> : null}
        <div className="admin-list">
          {missions.data?.data.map((mission) => (
            <article key={mission.id}>
              <div className="admin-list-main">
                <span className={`status-pill status-${mission.status}`}>{statusLabels[mission.status]}</span>
                <h3>{mission.title}</h3>
                <p>{mission.region} · {mission.signupCount}/{mission.partySize} inscritos · {mission.authorName}</p>
              </div>
              <div className="admin-row-actions">
                {hasCapability(me, "mission:edit", campaignId) ? (
                  <button type="button" onClick={() => setEditing(mission)}>Editar</button>
                ) : null}
                {(mission.status === "draft" || mission.status === "rejected") ? (
                  <button type="button" onClick={() => transition.mutate({ mission, status: "pending_review" })}>Enviar à revisão</button>
                ) : null}
                {mission.status === "pending_review" && canReview ? (
                  <>
                    <button type="button" onClick={() => transition.mutate({ mission, status: "approved" })}>Aprovar</button>
                    <button type="button" onClick={() => transition.mutate({ mission, status: "rejected" })}>Rejeitar</button>
                  </>
                ) : null}
                {mission.status === "approved" && canPublish ? (
                  <button type="button" onClick={() => transition.mutate({ mission, status: "published" })}>Publicar</button>
                ) : null}
                {mission.status !== "archived" && hasCapability(me, "mission:edit", campaignId) ? (
                  <button className="danger-link" type="button" onClick={() => archive.mutate(mission)}>Arquivar</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {transition.isError ? <p className="inline-error">{errorMessage(transition.error)}</p> : null}
        {archive.isError ? <p className="inline-error">{errorMessage(archive.error)}</p> : null}
      </div>

      {canCreate || editing ? (
        <MissionForm
          campaignId={campaignId}
          mission={editing}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(payload) => save.mutate(payload)}
          error={save.isError ? errorMessage(save.error) : null}
        />
      ) : (
        <aside className="permission-note">Seu perfil pode acompanhar o fluxo, mas não criar missões.</aside>
      )}
    </div>
  );
}

function MissionForm({
  campaignId,
  mission,
  busy,
  onCancel,
  onSubmit,
  error,
}: Readonly<{
  campaignId: string;
  mission: MissionSummary | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (value: CreateMissionInput | (UpdateMissionInput & { id: string })) => void;
  error: string | null;
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
    onSubmit(
      mission
        ? { ...fields, id: mission.id, version: mission.version }
        : { ...fields, campaignId },
    );
  }

  return (
    <aside className="admin-editor">
      <div className="admin-section-title">
        <div><span>{mission ? "EDIÇÃO" : "NOVO CHAMADO"}</span><h2>{mission ? mission.title : "Criar missão"}</h2></div>
      </div>
      <form className="admin-form" key={mission?.id ?? "new"} onSubmit={submit}>
        <label className="full">Título<input name="title" defaultValue={mission?.title} required minLength={3} /></label>
        <label>Região<input name="region" defaultValue={mission?.region} required /></label>
        <label>Risco<select name="risk" defaultValue={mission?.risk ?? "unknown"}><option value="unknown">Desconhecido</option><option value="moderate">Moderado</option><option value="dangerous">Perigoso</option><option value="deadly">Letal</option></select></label>
        <label>Partida<input name="scheduledFor" type="datetime-local" defaultValue={toLocalInput(mission?.scheduledFor)} /></label>
        <label>Vagas<input name="partySize" type="number" min={1} max={12} defaultValue={mission?.partySize ?? 5} required /></label>
        <label className="full">Descrição<textarea name="summary" rows={7} defaultValue={mission?.summary} required /></label>
        <div className="form-actions full">
          <button className="admin-primary" disabled={busy}>{mission ? "Salvar alterações" : "Criar rascunho"}</button>
          {mission ? <button type="button" onClick={onCancel}>Cancelar</button> : null}
        </div>
      </form>
      {error ? <p className="inline-error">{error}</p> : null}
    </aside>
  );
}

async function invalidateMissions(
  queryClient: ReturnType<typeof useQueryClient>,
  campaignId: string,
) {
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
