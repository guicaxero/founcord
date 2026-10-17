"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  DiscordForumListResponse,
  DiscordImportResult,
  DiscordImportThreadListResponse,
} from "@ordem/contracts";
import { useMemo, useState, type FormEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/surface";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDate, normalizeSearch } from "@/lib/format";
import { SearchField } from "./kit";

export const MAX_PER_IMPORT = 20;
/** Fóruns onde a Ordem guarda crônicas e registros; aparecem primeiro. */
const PREFERRED_FORUMS = ["codice-dos-corvos", "registros-dos-corvos", "registros-das-missoes"];

/** Ordena os fóruns pela preferência informada; os demais seguem na ordem do Discord. */
export function sortForums<T extends { name: string }>(forums: readonly T[], preferred: readonly string[] = PREFERRED_FORUMS): T[] {
  const rank = (name: string) => {
    const index = preferred.findIndex((candidate) => forumKey(name).includes(candidate));
    return index === -1 ? preferred.length : index;
  };
  return [...forums].sort((left, right) => rank(left.name) - rank(right.name));
}

function forumKey(name: string): string {
  return normalizeSearch(name).replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

/**
 * Importa tópicos dos fóruns do Discord como crônicas: o mestre escolhe o
 * fórum, marca os tópicos e decide se entram como rascunho ou já publicados.
 */
export function DiscordImportDialog({
  campaignId,
  open,
  canPublish,
  returnFocusRef,
  onClose,
  onImported,
}: Readonly<{
  campaignId: string;
  open: boolean;
  canPublish: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onImported: () => Promise<void>;
}>) {
  const [forumId, setForumId] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [publish, setPublish] = useState(false);

  const forums = useQuery({
    queryKey: ["campaigns", campaignId, "discord-import", "forums"],
    queryFn: () => apiFetch<DiscordForumListResponse>(`/api/campaigns/${campaignId}/discord-import/forums`),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const sortedForums = useMemo(() => sortForums(forums.data?.data ?? []), [forums.data]);
  const forum = sortedForums.find((candidate) => candidate.id === forumId) ?? sortedForums[0] ?? null;

  const threads = useQuery({
    queryKey: ["campaigns", campaignId, "discord-import", "threads", forum?.id ?? ""],
    queryFn: () =>
      apiFetch<DiscordImportThreadListResponse>(
        `/api/campaigns/${campaignId}/discord-import/forums/${forum!.id}/threads`,
      ),
    enabled: open && Boolean(forum),
  });
  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    return (threads.data?.data ?? []).filter((thread) => !term || normalizeSearch(thread.name).includes(term));
  }, [search, threads.data]);
  const available = visible.filter((thread) => !thread.importedPostId);

  const run = useMutation({
    mutationFn: () =>
      apiFetch<DiscordImportResult>(`/api/campaigns/${campaignId}/discord-import`, {
        method: "POST",
        body: JSON.stringify({ forumChannelId: forum!.id, threadIds: [...chosen], publish }),
      }),
    onSuccess: async () => {
      setChosen(new Set());
      await Promise.all([onImported(), threads.refetch()]);
    },
  });

  function toggle(threadId: string, checked: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (checked && next.size < MAX_PER_IMPORT) next.add(threadId);
      else next.delete(threadId);
      return next;
    });
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
      title="Importar crônicas do Discord"
      description="Traz tópicos dos fóruns do Discord para o portal, com as imagens. Só a mensagem inicial de cada tópico é importada; as respostas ficam no Discord."
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
                setChosen(new Set());
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
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SearchField label="Buscar tópico" value={search} onChange={setSearch} placeholder="Título do tópico" />
              <Button
                size="sm"
                variant="ghost"
                disabled={available.length === 0 || run.isPending}
                onClick={() => setChosen(new Set(available.slice(0, MAX_PER_IMPORT).map((thread) => thread.threadId)))}
              >
                Marcar {Math.min(available.length, MAX_PER_IMPORT)} novos
              </Button>
            </div>
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
              <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto rounded-md border border-line-soft">
                {visible.map((thread) => (
                  <li key={thread.threadId} className="flex items-center justify-between gap-3 px-3">
                    <Checkbox
                      className="min-w-0 flex-1"
                      label={
                        <span className="block min-w-0">
                          <span className="block truncate font-semibold text-fg">{thread.name || "Tópico sem título"}</span>
                          <span className="text-xs text-fg-subtle">{formatDate(thread.createdAt, "Sem data")}</span>
                        </span>
                      }
                      checked={chosen.has(thread.threadId)}
                      disabled={Boolean(thread.importedPostId) || run.isPending || (!chosen.has(thread.threadId) && chosen.size >= MAX_PER_IMPORT)}
                      onChange={(event) => toggle(thread.threadId, event.target.checked)}
                    />
                    {thread.importedPostId ? <Badge tone="success">Já no portal</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-fg-subtle" aria-live="polite">
              {chosen.size} de até {MAX_PER_IMPORT} tópicos marcados por vez.
            </p>
          </div>
        ) : null}

        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-fg-muted">Como entram no portal</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="radio"
              name="publish"
              className="size-5 accent-accent"
              checked={!publish}
              onChange={() => setPublish(false)}
            />
            Como rascunho, para revisar antes de publicar
          </label>
          {canPublish ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name="publish"
                className="size-5 accent-accent"
                checked={publish}
                onChange={() => setPublish(true)}
              />
              Já publicadas, com a data original do Discord
            </label>
          ) : null}
        </fieldset>

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
                ? "Nenhum tópico foi importado"
                : `${result.imported.length} ${result.imported.length === 1 ? "crônica importada" : "crônicas importadas"}`
            }
          >
            {result.imported.length > 0 ? (
              <p>
                {publish ? "Já estão em Crônicas." : "Estão como rascunho na lista do painel."}{" "}
                {result.imported.reduce((total, entry) => total + entry.images, 0)} imagens copiadas.
              </p>
            ) : null}
            {result.skipped.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.skipped.map((entry, index) => (
                  <li key={`${entry.threadId}-${index}`}>
                    {names.get(entry.threadId) ?? "Tópico"}: {entry.reason}
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
              : `Importar ${chosen.size || ""} ${chosen.size === 1 ? "tópico" : "tópicos"}`.replace("  ", " ")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
