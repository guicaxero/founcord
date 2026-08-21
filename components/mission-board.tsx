"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentUserResponse,
  MissionListResponse,
  MissionSummary,
} from "@vigilia/contracts";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

const riskLabels = {
  unknown: "Desconhecida",
  moderate: "Moderada",
  dangerous: "Perigosa",
  deadly: "Letal",
} as const;

export function MissionBoard({
  campaignId,
  initialMissions,
}: Readonly<{ campaignId: string; initialMissions: MissionSummary[] }>) {
  const queryClient = useQueryClient();
  const missions = useQuery({
    queryKey: queryKeys.missions(campaignId),
    queryFn: () =>
      apiFetch<MissionListResponse>(`/api/campaigns/${campaignId}/missions`),
    initialData: { data: initialMissions, nextCursor: null },
    initialDataUpdatedAt: 0,
  });
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
  });
  const signup = useMutation({
    mutationFn: (mission: MissionSummary) =>
      apiFetch<{ status: "confirmed" | "waitlisted" }>(
        `/api/missions/${mission.id}/signups`,
        {
          method:
            mission.currentUserSignup === "confirmed" ||
            mission.currentUserSignup === "waitlisted"
              ? "DELETE"
              : "POST",
        },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.missions(campaignId) }),
  });

  return (
    <div className="mission-list" aria-live="polite">
      {missions.isError ? (
        <div className="board-state">{errorMessage(missions.error)}</div>
      ) : missions.data.data.length === 0 ? (
        <div className="board-state">
          <strong>Nenhum chamado publicado.</strong>
          <span>Novas missões aparecerão aqui quando forem anunciadas pela Ordem.</span>
        </div>
      ) : (
        missions.data.data.map((mission, index) => (
          <article className="mission-card" key={mission.id}>
            <div className="mission-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="mission-body">
              <div className="mission-labels">
                <span className={`urgency urgency-${index % 3}`}>
                  {mission.signupCount >= mission.partySize ? "Lista de espera" : "Recrutando"}
                </span>
                <span>{mission.region}</span>
              </div>
              <h3>{mission.title}</h3>
              <p>{mission.summary}</p>
              <small>Por {mission.authorName}</small>
            </div>
            <dl className="mission-meta">
              <div><dt>Partida</dt><dd>{formatDate(mission.scheduledFor)}</dd></div>
              <div><dt>Companhia</dt><dd>{mission.signupCount} / {mission.partySize}</dd></div>
              <div><dt>Risco</dt><dd>{riskLabels[mission.risk]}</dd></div>
            </dl>
            {me.data?.authenticated ? (
              <button
                className="card-action signup-action"
                type="button"
                disabled={signup.isPending && signup.variables?.id === mission.id}
                onClick={() => signup.mutate(mission)}
                aria-label={signupLabel(mission)}
                title={signupLabel(mission)}
              >
                {mission.currentUserSignup === "confirmed" ||
                mission.currentUserSignup === "waitlisted" ? "×" : "+"}
              </button>
            ) : (
              <a
                className="card-action signup-action"
                href="/api/auth/discord?returnTo=/"
                aria-label="Entrar para se inscrever"
                title="Entrar para se inscrever"
              >+</a>
            )}
          </article>
        ))
      )}
      {signup.isError ? <p className="inline-error">{errorMessage(signup.error)}</p> : null}
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "A definir";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value)).replace(".", "").toUpperCase();
}

function signupLabel(mission: MissionSummary): string {
  if (mission.currentUserSignup === "confirmed") return "Cancelar inscrição confirmada";
  if (mission.currentUserSignup === "waitlisted") return "Sair da lista de espera";
  return mission.signupCount >= mission.partySize
    ? "Entrar na lista de espera"
    : "Inscrever-se na missão";
}
