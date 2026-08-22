"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuditListResponse } from "@vigilia/contracts";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

const actionLabels: Readonly<Record<string, string>> = {
  "auth.login": "entrou no portal",
  "campaign.created": "criou a campanha",
  "campaign.updated": "alterou a campanha",
  "member.added": "adicionou um membro",
  "member.updated": "alterou um membro",
  "mission.created": "criou uma missão",
  "mission.updated": "alterou uma missão",
  "mission.pending_review": "enviou uma missão à revisão",
  "mission.approved": "aprovou uma missão",
  "mission.published": "publicou uma missão",
  "mission.signup": "inscreveu-se em uma missão",
  "mission.withdrawal": "saiu de uma missão",
  "post.created": "criou um post",
  "post.pending_review": "enviou um post à revisão",
  "post.approved": "aprovou um post",
  "post.published": "publicou um post",
  "post.deleted_permanently": "excluiu um post permanentemente",
};

export function AuditPanel({ campaignId }: Readonly<{ campaignId: string }>) {
  const audit = useQuery({
    queryKey: queryKeys.audit(campaignId),
    queryFn: () =>
      apiFetch<AuditListResponse>(`/api/campaigns/${campaignId}/audit?limit=100`),
  });

  return (
    <div className="admin-panel-narrow audit-panel">
      <div className="admin-section-title"><div><span>RASTRO IMUTÁVEL</span><h2>Auditoria</h2></div></div>
      {audit.data?.data.map((entry) => (
        <article key={entry.id}>
          <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
          <div>
            <h3>{entry.actorName ?? "Sistema"} {actionLabels[entry.action] ?? entry.action}</h3>
            <p>{entry.entityType} · {entry.entityId.slice(0, 8)} · correlação {entry.correlationId.slice(0, 8)}</p>
          </div>
        </article>
      ))}
      {audit.data?.data.length === 0 ? <p>Nenhuma ação registrada ainda.</p> : null}
      {audit.isError ? <p className="inline-error">{errorMessage(audit.error)}</p> : null}
    </div>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
