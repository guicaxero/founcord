"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CharacterNotesUpdate, CharacterSheet } from "@ordem/contracts";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

const MAX_CHARS = 8_000;

/**
 * Anotações do personagem: a descrição que a ficha do Foundry mostra. O texto
 * vai ao módulo, que só grava se a descrição não mudou no Foundry desde a
 * versão que o jogador está vendo.
 */
export function NotesSection({
  campaignId,
  sheet,
  notesUpdate,
}: Readonly<{ campaignId: string; sheet: CharacterSheet; notesUpdate: CharacterNotesUpdate | null }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fieldId = useId();
  const hintId = useId();
  const [text, setText] = useState(sheet.notes.text);
  // Texto do Foundry em que a edição se baseia; acompanha a ficha enquanto não houver edição.
  const [base, setBase] = useState(sheet.notes);
  const dirty = text.trim() !== base.text.trim();
  // Com a gravação recusada por conflito, o texto do jogador fica na tela até ele decidir.
  if (sheet.notes.revision !== base.revision && !dirty && notesUpdate?.status !== "conflict") {
    setBase(sheet.notes);
    setText(sheet.notes.text);
  }
  const pending = notesUpdate?.status === "pending_delivery";
  const changedInFoundry = sheet.notes.revision !== base.revision;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: (submitted: string) =>
      apiFetch<CharacterNotesUpdate>(`/api/me/characters/${campaignId}/notes`, {
        method: "POST",
        body: JSON.stringify({ text: submitted, revision: base.revision }),
      }),
    onSuccess: async (update, submitted) => {
      // O texto enviado vira a base: a ficha volta com a versão nova depois que o módulo gravar.
      if (update.status !== "failed") setBase((current) => ({ ...current, text: submitted }));
      toast(
        update.status === "failed"
          ? { title: "As anotações não foram enviadas", description: update.error ?? undefined, tone: "danger" }
          : {
              title: "Anotações enviadas ao Foundry",
              description: "Elas são gravadas na ficha assim que o mestre estiver no mundo.",
              tone: "info",
            },
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.myCharacterSheet(campaignId) });
    },
  });

  function reload() {
    setBase(sheet.notes);
    setText(sheet.notes.text);
    save.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dirty && !pending) save.mutate(text);
  }

  // Bloqueia só enquanto a edição se baseia numa versão que já mudou no Foundry.
  const conflict =
    changedInFoundry || (save.error instanceof ApiClientError && save.error.code === "notes_changed");

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-1">
        <h5 className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">Anotações do personagem</h5>
        <p className="text-sm text-fg-muted" id={hintId}>
          História, objetivos e lembretes. É o mesmo texto da descrição na ficha do Foundry; a formatação feita lá é
          substituída por parágrafos simples ao salvar.
        </p>
      </div>

      <NotesStatus update={notesUpdate} />
      {conflict ? (
        <Notice tone="warning" role="alert" title="A descrição mudou no Foundry">
          <p>Carregue o texto atual antes de editar. O que você escreveu aqui desde então será descartado.</p>
          <Button size="sm" className="mt-2" onClick={reload}>
            Carregar o texto atual
          </Button>
        </Notice>
      ) : save.isError ? (
        <Notice tone="danger" role="alert">
          {errorMessage(save.error)}
        </Notice>
      ) : null}

      <label className="sr-only" htmlFor={fieldId}>
        Anotações do personagem
      </label>
      <Textarea
        id={fieldId}
        aria-describedby={hintId}
        rows={12}
        maxLength={MAX_CHARS}
        value={pending && notesUpdate ? notesUpdate.text : text}
        disabled={pending}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle tabular-nums" aria-live="polite">
          {dirty ? "Alterações não salvas · " : ""}
          {text.length.toLocaleString("pt-BR")} de {MAX_CHARS.toLocaleString("pt-BR")} caracteres
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty || save.isPending} onClick={reload}>
            Descartar
          </Button>
          <Button type="submit" variant="primary" disabled={!dirty || pending || save.isPending || conflict}>
            {save.isPending ? "Enviando…" : "Salvar no Foundry"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function NotesStatus({ update }: Readonly<{ update: CharacterNotesUpdate | null }>) {
  if (!update) return null;
  if (update.status === "pending_delivery") {
    return (
      <Notice tone="info" role="status" title="Aguardando o Foundry">
        As anotações enviadas em {formatDateTime(update.requestedAt)} são gravadas assim que o mestre estiver no mundo
        com o módulo conectado.
      </Notice>
    );
  }
  if (update.status === "conflict") {
    return (
      <Notice tone="warning" title="A última alteração não foi gravada">
        {update.error ?? "A descrição mudou no Foundry antes de a alteração chegar."}
      </Notice>
    );
  }
  if (update.status === "failed") {
    return (
      <Notice tone="danger" role="alert" title="O Foundry não gravou as anotações">
        {update.error ?? "Tente salvar de novo."}
      </Notice>
    );
  }
  if (update.status === "applied" && update.appliedAt) {
    return (
      <Notice tone="success" title="Gravadas no Foundry">
        Última alteração gravada em {formatDateTime(update.appliedAt)}.
      </Notice>
    );
  }
  return null;
}
