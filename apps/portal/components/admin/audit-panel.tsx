"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuditListResponse } from "@ordem/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FeedbackState } from "@/components/ui/feedback-state";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime, normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelLoading, SearchField } from "./kit";
import { timestamp } from "./status";

type AuditEntry = AuditListResponse["data"][number];

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
  "post.created": "criou uma publicação",
  "post.pending_review": "enviou uma publicação à revisão",
  "post.approved": "aprovou uma publicação",
  "post.published": "publicou uma publicação",
  "post.deleted_permanently": "excluiu uma publicação permanentemente",
};

function describe(entry: AuditEntry): string {
  return `${entry.actorName ?? "Sistema"} ${actionLabels[entry.action] ?? entry.action}`;
}

export function AuditPanel({ campaignId }: Readonly<{ campaignId: string }>) {
  const [search, setSearch] = useState("");
  const audit = useQuery({
    queryKey: queryKeys.audit(campaignId),
    queryFn: () => apiFetch<AuditListResponse>(`/api/campaigns/${campaignId}/audit?limit=100`),
  });

  if (audit.isPending) return <PanelLoading label="Carregando o histórico" rows={5} />;
  if (audit.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar o histórico"
        tone="error"
        role="alert"
        action={<Button onClick={() => audit.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(audit.error)}
      </FeedbackState>
    );
  }

  const entries = audit.data.data;
  const query = normalizeSearch(search);
  const visible = query
    ? entries.filter((entry) => normalizeSearch(`${describe(entry)} ${entry.entityType}`).includes(query))
    : entries;

  if (entries.length === 0) {
    return (
      <FeedbackState title="Nenhuma ação registrada ainda">
        Criações, revisões, publicações e mudanças de acesso aparecem aqui assim que acontecem.
      </FeedbackState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SearchField label="Buscar no histórico" value={search} onChange={setSearch} placeholder="Pessoa, ação ou tipo de registro" />
        <p className="text-sm text-fg-subtle" aria-live="polite">
          {visible.length === entries.length
            ? `${entries.length} ${entries.length === 1 ? "ação registrada" : "ações mais recentes"}.`
            : `${visible.length} de ${entries.length} ações.`}
        </p>
      </div>
      <DataTable
        caption="Histórico de ações da campanha"
        rows={visible}
        rowKey={(entry) => entry.id}
        initialSort={{ column: "when", direction: "descending" }}
        empty={<FeedbackState title="Nada corresponde à busca">Tente o nome de uma pessoa ou de uma ação.</FeedbackState>}
        columns={[
          {
            id: "when",
            header: "Quando",
            sortValue: (entry) => timestamp(entry.createdAt),
            className: "w-48 whitespace-nowrap text-fg-muted",
            cell: (entry) => <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>,
          },
          {
            id: "action",
            header: "Ação",
            sortValue: describe,
            cell: (entry) => <span className="font-medium text-fg">{describe(entry)}</span>,
          },
          {
            id: "record",
            header: "Registro",
            className: "text-xs text-fg-subtle",
            cell: (entry) => (
              <span className="font-mono">
                {entry.entityType} · {entry.entityId.slice(0, 8)}
                <span className="block">correlação {entry.correlationId.slice(0, 8)}</span>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
