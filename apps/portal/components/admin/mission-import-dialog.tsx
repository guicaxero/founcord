"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  DiscordForumListResponse,
  DiscordImportThreadListResponse,
  MissionDiscordImportResult,
  MissionOutcome,
} from "@ordem/contracts";
import { useMemo, useState, type FormEvent, type RefObject } from "react";
import { outcomeLabels } from "@/components/missions/mission-presentation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/surface";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDate, normalizeSearch } from "@/lib/format";
import { MAX_PER_IMPORT, sortForums } from "./discord-import-dialog";
import { SearchField } from "./kit";

/** O fórum de registros de missão vem primeiro. */
const PREFERRED = ["registros-das-missoes", "missoes"];

/**
 * Traz as missões antigas do fórum de registros do Discord: cada tópico vira
 * uma missão publicada direto no registro, com a situação escolhida aqui.
 */
export function MissionImportDialog({
  campaignId,
  open,
  returnFocusRef,
  onClose,
  onImported,
}: Readonly<{
  campaignId: string;
  open: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onImported: () => Promise<void>;
}>) {
  const [forumId, setForumId] = useState("");
  const [chosen, setChosen] = useState<ReadonlyMap<string, MissionOutcome>>(new Map());
  const [search, setSearch] = useState("");

  const forums = useQuery({
    queryKey: ["campaigns", campaignId, "discord-import", "forums"],
    queryFn: () => apiFetch<DiscordForumListResponse>(`/api/campaigns/${campaignId}/discord-import/forums`),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const sortedForums = useMemo(() => sortForums(forums.data?.data ?? [], PREFERRED), [forums.data]);
  const forum = sortedForums.find((candidate) => candidate.id === forumId) ?? sortedForums[0] ?? null;

  const threads = useQuery({
    queryKey: ["campaigns", campaignId, "discord-import", "threads", forum?.id ?? ""],
    queryFn: () =>
      apiFetch<DiscordImportThreadListResponse>(`/api/campaigns/${campaignId}/discord-import/forums/${forum!.id}/threads`),
    enabled: open && Boolean(forum),
  });
  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    return (threads.data?.data ?? []).filter((thread) => !term || normalizeSearch(thread.name).includes(term));
  }, [search, threads.data]);
  const available = visible.filter((thread) => !thread.importedMissionId);

  const run = useMutation({
    mutationFn: () =>
      apiFetch<MissionDiscordImportResult>(`/api/campaigns/${campaignId}/missions/discord-import`, {
        method: "POST",
        body: JSON.stringify({
          forumChannelId: forum!.id,
          items: [...chosen].map(([threadId, outcome]) => ({ threadId, outcome })),
        }),
      }),
    onSuccess: async () => {
      setChosen(new Map());
      await Promise.all([onImported(), threads.refetch()]);
    },
  });

  function toggle(threadId: string, checked: boolean) {
    setChosen((current) => {
      const next = new Map(current);
      if (checked && next.size < MAX_PER_IMPORT) next.set(threadId, "completed");
      else next.delete(threadId);
      return next;
    });
  }

  function setOutcome(threadId: string, outcome: MissionOutcome) {
    setChosen((current) => new Map(current).set(threadId, outcome));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chosen.size > 0 && forum) run.mutate();
  }

  const names = new Map((threads.data?.data ?? []).map((thread) => [thread.threadId, thread.name]));
  const result = run.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !run.isPending) {
          run.reset();
          onClose();
        }
      }}
      title="Importar registros do Discord"
      description="Cada tópico vira uma missão no registro público, com número e nome tirados do título (Missão Nº 001 - …), a região da linha “Local:” e a primeira imagem como capa. Escolha a situação de cada uma."
      returnFocusRef={returnFocusRef}
      className="max-w-2xl"
    >
      <form className="space-y-5" onSubmit={submit}>
        {forums.isError ? (
          <Notice tone="danger" role="alert" title="Não foi possível ler os fóruns">
            {errorMessage(forums.error)}
          </Notice>
        ) : null}
        <Field label="Fórum">
          {({ id }) => (
            <Select
              id={id}
              value={forum?.id ?? ""}
              disabled={!forums.data || run.isPending}
              onChange={(event) => {
                setForumId(event.target.value);
                setChosen(new Map());
                run.reset();
              }}
            >
              {forums.isPending ? <option value="">Carregando fóruns…</option> : null}
              {sortedForums.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {forum ? (
          <div className="space-y-3">
            <SearchField label="Buscar tópico" value={search} onChange={setSearch} placeholder="Título do tópico" />
            {threads.isPending ? (
              <p className="text-sm text-fg-muted" role="status">
                Lendo os tópicos do fórum…
              </p>
            ) : threads.isError ? (
              <Notice tone="danger" role="alert">
                {errorMessage(threads.error)}
              </Notice>
            ) : visible.length === 0 ? (
              <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
                Nenhum tópico encontrado neste fórum.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-line-soft overflow-y-auto rounded-md border border-line-soft">
                {visible.map((thread) => {
                  const outcome = chosen.get(thread.threadId);
                  const title = thread.name || "Tópico sem título";
                  return (
                    <li key={thread.threadId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1">
                      <Checkbox
                        className="min-w-0 flex-1"
                        label={
                          <span className="block min-w-0">
                            <span className="block font-semibold break-words text-fg">{title}</span>
                            <span className="text-xs text-fg-subtle">{formatDate(thread.createdAt, "Sem data")}</span>
                          </span>
                        }
                        checked={outcome !== undefined}
                        disabled={
                          Boolean(thread.importedMissionId) ||
                          run.isPending ||
                          (outcome === undefined && chosen.size >= MAX_PER_IMPORT)
                        }
                        onChange={(event) => toggle(thread.threadId, event.target.checked)}
                      />
                      {thread.importedMissionId ? <Badge tone="success">Já no registro</Badge> : null}
                      {outcome !== undefined ? (
                        <label className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
                          Situação <span className="sr-only">de {title}</span>
                          <Select
                            value={outcome}
                            disabled={run.isPending}
                            onChange={(event) => setOutcome(thread.threadId, event.target.value as MissionOutcome)}
                            className="w-auto"
                          >
                            <option value="completed">{outcomeLabels.completed}</option>
                            <option value="failed">{outcomeLabels.failed}</option>
                            <option value="in_progress">{outcomeLabels.in_progress}</option>
                          </Select>
                        </label>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-fg-subtle" aria-live="polite">
              {chosen.size} de até {MAX_PER_IMPORT} tópicos marcados por vez
              {available.length > 0 ? ` · ${available.length} ainda fora do registro` : ""}.
            </p>
          </div>
        ) : null}

        {run.isError ? (
          <Notice tone="danger" role="alert">
            {errorMessage(run.error)}
          </Notice>
        ) : null}
        {result ? (
          <Notice
            tone={result.imported.length > 0 ? "success" : "warning"}
            role="status"
            title={
              result.imported.length === 0
                ? "Nenhuma missão foi importada"
                : `${result.imported.length} ${result.imported.length === 1 ? "missão registrada" : "missões registradas"}`
            }
          >
            {result.imported.length > 0 ? <p>Já estão em Registro de missões. Marque os Corvos que participaram em cada uma.</p> : null}
            {result.skipped.length + result.notes.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.skipped.map((entry, index) => (
                  <li key={`s-${entry.threadId}-${index}`}>
                    {names.get(entry.threadId) ?? "Tópico"}: {entry.reason}
                  </li>
                ))}
                {result.notes.map((entry, index) => (
                  <li key={`n-${entry.threadId}-${index}`}>
                    {names.get(entry.threadId) ?? "Tópico"}: {entry.note}
                  </li>
                ))}
              </ul>
            ) : null}
          </Notice>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
          <Button disabled={run.isPending} onClick={onClose}>
            {result ? "Fechar" : "Cancelar"}
          </Button>
          <Button type="submit" variant="primary" disabled={chosen.size === 0 || run.isPending || !forum}>
            {run.isPending
              ? "Importando…"
              : chosen.size === 0
                ? "Importar"
                : `Importar ${chosen.size} ${chosen.size === 1 ? "missão" : "missões"}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
