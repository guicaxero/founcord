"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  discordThreadUrl,
  type CampaignCharacterLink,
  type RegistroThread,
  type RegistroThreadListResponse,
} from "@ordem/contracts";
import { useState, type FormEvent } from "react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");

/** Tópicos cujo título contém o primeiro nome do personagem, os mais parecidos primeiro. */
export function suggestThreads(threads: readonly RegistroThread[], actorName: string): RegistroThread[] {
  const full = normalize(actorName).trim();
  const first = full.split(/[\s,]+/u)[0] ?? full;
  if (!first) return [];
  return threads
    .filter((thread) => normalize(thread.name).includes(first))
    .sort((a, b) => Number(normalize(b.name).includes(full)) - Number(normalize(a.name).includes(full)))
    .slice(0, 3);
}

/**
 * Tópico do Corvo no Registro do Corvo do Discord. O bot publica ali as
 * atividades da Sede e os resultados. Aceita o link copiado no Discord ou uma
 * sugestão pelo nome do personagem.
 */
export function RegistroField({
  campaignId,
  link,
}: Readonly<{ campaignId: string; link: CampaignCharacterLink }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [searching, setSearching] = useState(false);
  const threads = useQuery({
    queryKey: queryKeys.registroThreads(campaignId),
    queryFn: () => apiFetch<RegistroThreadListResponse>(`/api/campaigns/${campaignId}/character-links/registro-threads`),
    enabled: searching,
    staleTime: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: (thread: string | null) =>
      apiFetch<CampaignCharacterLink>(
        `/api/campaigns/${campaignId}/members/${link.userId}/character-link/registro`,
        { method: "PUT", body: JSON.stringify({ thread }) },
      ),
    onSuccess: async (updated) => {
      setValue("");
      setSearching(false);
      toast({
        title: updated.registro ? "Tópico do Registro do Corvo salvo" : "Tópico removido",
        description: updated.registro
          ? `As atividades da Sede de ${updated.actorName} passam a ser publicadas nele.`
          : "As atividades deste Corvo deixam de ir para o Discord.",
        tone: "success",
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.characterLinks(campaignId) });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim()) save.mutate(value.trim());
  }

  const suggestions = threads.data ? suggestThreads(threads.data.data, link.actorName) : [];

  return (
    <div className="space-y-3 rounded-md border border-line-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">Registro do Corvo</p>
        {link.registro?.guildId ? (
          <ButtonAnchor size="sm" variant="link" href={discordThreadUrl(link.registro.guildId, link.registro.threadId)} target="_blank" rel="noreferrer">
            Abrir tópico no Discord ↗
          </ButtonAnchor>
        ) : null}
      </div>
      <p className="text-sm text-fg-muted">
        {link.registro
          ? "O bot publica neste tópico as atividades da Sede e os resultados."
          : "Sem tópico ligado: as atividades da Sede ficam só no portal."}
      </p>
      <form className="space-y-2" onSubmit={submit}>
        <Field label={link.registro ? "Trocar tópico" : "Link do tópico"} hint="No Discord, clique com o botão direito no tópico › Copiar link.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              inputMode="url"
              placeholder="https://discord.com/channels/…"
              value={value}
              maxLength={300}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" variant="primary" disabled={!value.trim() || save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar tópico"}
          </Button>
          <Button size="sm" disabled={save.isPending || threads.isFetching} onClick={() => setSearching(true)}>
            {threads.isFetching ? "Procurando…" : "Sugerir pelo nome"}
          </Button>
          {link.registro ? (
            <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              Remover tópico
            </Button>
          ) : null}
        </div>
      </form>
      {searching && threads.isError ? (
        <Notice tone="warning" role="alert">
          {errorMessage(threads.error)}
        </Notice>
      ) : null}
      {searching && threads.data ? (
        suggestions.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Tópicos sugeridos">
            {suggestions.map((thread) => (
              <li key={thread.id}>
                <Button size="sm" variant="secondary" disabled={save.isPending} onClick={() => save.mutate(thread.id)}>
                  Usar «{thread.name}»{thread.archived ? " (arquivado)" : ""}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">
            Nenhum tópico do Registro do Corvo tem o nome {link.actorName}. Cole o link do tópico acima.
          </p>
        )
      ) : null}
      {save.isError ? (
        <Notice tone="danger" role="alert">
          {errorMessage(save.error)}
        </Notice>
      ) : null}
    </div>
  );
}
