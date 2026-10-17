"use client";

import { useMutation } from "@tanstack/react-query";
import type { Post, PostListResponse } from "@ordem/contracts";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

type Row = Readonly<{ post: Post; tags: string }>;

function initialRows(posts: readonly Post[]): { pinned: Row[]; others: Row[] } {
  const toRow = (post: Post): Row => ({ post, tags: post.tags.join(", ") });
  const pinned = posts
    .filter((post) => post.pinnedOrder !== null)
    .sort((left, right) => (left.pinnedOrder ?? 0) - (right.pinnedOrder ?? 0))
    .map(toRow);
  const others = posts
    .filter((post) => post.pinnedOrder === null)
    .sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""))
    .map(toRow);
  return { pinned, others };
}

function tagsOf(value: string): string[] {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

/**
 * Organização do arquivo de Crônicas: quais ficam no topo, em que ordem, e as
 * tags de cada crônica publicada. As que não estão no topo seguem pela data.
 */
export function ChroniclesArrangementDialog({
  open,
  posts,
  campaignId,
  returnFocusRef,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  posts: readonly Post[];
  campaignId: string;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}>) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Organizar o arquivo"
      description="Escolha as crônicas que abrem o arquivo e a ordem delas, como uma sequência (Crônica I, II, III). As demais seguem pela data de publicação."
      className="max-w-3xl"
      returnFocusRef={returnFocusRef}
    >
      {open ? (
        <ArrangementForm key={posts.map((post) => `${post.id}:${post.pinnedOrder}`).join()} posts={posts} campaignId={campaignId} onCancel={onClose} onSaved={onSaved} />
      ) : null}
    </Dialog>
  );
}

function ArrangementForm({
  posts,
  campaignId,
  onCancel,
  onSaved,
}: Readonly<{
  posts: readonly Post[];
  campaignId: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}>) {
  const [state, setState] = useState(() => initialRows(posts));
  /** Controle que recebe o foco depois de uma mudança na lista. */
  const focusTarget = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const errorRef = useRef<HTMLDivElement>(null);
  const save = useMutation({
    mutationFn: () =>
      apiFetch<PostListResponse>(`/api/campaigns/${campaignId}/posts/arrangement`, {
        method: "PUT",
        body: JSON.stringify({
          items: [
            ...state.pinned.map((row) => ({ postId: row.post.id, pinned: true, tags: tagsOf(row.tags) })),
            ...state.others.map((row) => ({ postId: row.post.id, pinned: false, tags: tagsOf(row.tags) })),
          ],
        }),
      }),
    onSuccess: () => onSaved(),
  });

  useEffect(() => {
    if (!focusTarget.current) return;
    // Depois de mover, o foco fica no mesmo controle; no fim da lista, no outro sentido.
    const key = focusTarget.current;
    focusTarget.current = null;
    const [id, action] = key.split(":");
    const opposite = action === "up" ? "down" : action === "down" ? "up" : null;
    const target = buttons.current.get(key);
    const fallback = opposite ? buttons.current.get(`${id}:${opposite}`) : undefined;
    (target && !target.disabled ? target : fallback)?.focus();
  }, [state]);
  useEffect(() => {
    if (save.isError) errorRef.current?.focus();
  }, [save.isError]);

  const register = (key: string) => (element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(key, element);
    else buttons.current.delete(key);
  };

  function move(index: number, delta: -1 | 1) {
    const pinned = [...state.pinned];
    const [row] = pinned.splice(index, 1);
    if (!row) return;
    pinned.splice(index + delta, 0, row);
    setState({ ...state, pinned });
    setAnnouncement(`${row.post.title} agora é a ${index + delta + 1}ª do topo.`);
    focusTarget.current = `${row.post.id}:${delta === -1 ? "up" : "down"}`;
  }

  function pin(row: Row) {
    setState({
      pinned: [...state.pinned, row],
      others: state.others.filter((candidate) => candidate.post.id !== row.post.id),
    });
    setAnnouncement(`${row.post.title} foi para o topo, na ${state.pinned.length + 1}ª posição.`);
    focusTarget.current = `${row.post.id}:unpin`;
  }

  function unpin(row: Row) {
    setState({
      pinned: state.pinned.filter((candidate) => candidate.post.id !== row.post.id),
      others: [...state.others, row].sort((left, right) =>
        (right.post.publishedAt ?? "").localeCompare(left.post.publishedAt ?? ""),
      ),
    });
    setAnnouncement(`${row.post.title} voltou a seguir pela data.`);
    focusTarget.current = `${row.post.id}:pin`;
  }

  function setTags(id: string, tags: string) {
    setState((current) => ({
      pinned: current.pinned.map((row) => (row.post.id === id ? { ...row, tags } : row)),
      others: current.others.map((row) => (row.post.id === id ? { ...row, tags } : row)),
    }));
  }

  if (posts.length === 0) {
    return (
      <div className="space-y-6">
        <p className="text-fg-muted">Nenhuma crônica publicada ainda. Publique uma para organizar o arquivo.</p>
        <div className="flex justify-end border-t border-line-soft pt-4">
          <Button onClick={onCancel}>Fechar</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <section aria-labelledby="arquivo-topo" className="space-y-3">
        <h3 id="arquivo-topo" className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">
          No topo do arquivo ({state.pinned.length})
        </h3>
        {state.pinned.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-fg-muted">
            Nenhuma crônica fixada. Use &quot;Pôr no topo&quot; abaixo para escolher as que abrem o arquivo.
          </p>
        ) : (
          <ol className="space-y-2">
            {state.pinned.map((row, index) => (
              <li key={row.post.id} className="space-y-3 rounded-md border border-line bg-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 font-semibold break-words">
                    <span className="mr-2 text-accent tabular-nums">{index + 1}º</span>
                    {row.post.title}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      ref={register(`${row.post.id}:up`)}
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={`Subir ${row.post.title}`}
                      onClick={() => move(index, -1)}
                    >
                      ↑ Subir
                    </Button>
                    <Button
                      ref={register(`${row.post.id}:down`)}
                      size="sm"
                      variant="ghost"
                      disabled={index === state.pinned.length - 1}
                      aria-label={`Descer ${row.post.title}`}
                      onClick={() => move(index, 1)}
                    >
                      ↓ Descer
                    </Button>
                    <Button ref={register(`${row.post.id}:unpin`)} size="sm" onClick={() => unpin(row)}>
                      Tirar do topo
                    </Button>
                  </div>
                </div>
                <TagsInput row={row} onChange={setTags} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="arquivo-data" className="space-y-3">
        <h3 id="arquivo-data" className="text-xs font-extrabold tracking-[0.14em] text-fg-subtle uppercase">
          Pela data de publicação ({state.others.length})
        </h3>
        {state.others.length === 0 ? (
          <p className="text-sm text-fg-muted">Todas as crônicas publicadas estão no topo.</p>
        ) : (
          <ul className="space-y-2">
            {state.others.map((row) => (
              <li key={row.post.id} className="space-y-3 rounded-md border border-line-soft p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words">
                    <span className="font-semibold">{row.post.title}</span>
                    <span className="ml-2 text-xs text-fg-subtle">{formatDate(row.post.publishedAt, "Sem data")}</span>
                  </p>
                  <Button ref={register(`${row.post.id}:pin`)} size="sm" onClick={() => pin(row)}>
                    Pôr no topo
                  </Button>
                </div>
                <TagsInput row={row} onChange={setTags} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {save.isError ? (
        <Notice ref={errorRef} tone="danger" role="alert">
          {errorMessage(save.error)}
        </Notice>
      ) : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={save.isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar organização"}
        </Button>
      </div>
    </form>
  );
}

function TagsInput({ row, onChange }: Readonly<{ row: Row; onChange: (id: string, tags: string) => void }>) {
  const id = `tags-${row.post.id}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-fg-muted">
        Tags <span className="sr-only">de {row.post.title}</span>
      </label>
      <Input
        id={id}
        value={row.tags}
        onChange={(event) => onChange(row.post.id, event.target.value)}
        placeholder="Temporada 1, Crônicas do Farol"
        maxLength={300}
        className="min-w-0 flex-1"
      />
    </div>
  );
}
