"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  mediaUrl,
  missionAnnouncement,
  type MissionDiscordView,
  type MissionSummary,
} from "@ordem/contracts";
import { useState, type FormEvent, type RefObject } from "react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { apiFetch, errorMessage } from "@/lib/api-client";

const MAX_TAGS = 5;

/**
 * Publica a missão num fórum do Discord (registros-das-missões vem
 * escolhido), com a capa como imagem do tópico, as tags do fórum e o texto do
 * chamado, que o mestre pode editar antes.
 */
export function MissionDiscordDialog({
  campaignId,
  mission,
  returnFocusRef,
  onClose,
  onPublished,
}: Readonly<{
  campaignId: string;
  mission: MissionSummary | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onPublished: (mission: MissionSummary) => Promise<void>;
}>) {
  const [forumId, setForumId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<readonly string[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [grade, setGrade] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [personaAvatarUrl, setPersonaAvatarUrl] = useState("");

  const view = useQuery({
    queryKey: ["campaigns", campaignId, "missions", mission?.id ?? "", "discord", forumId ?? ""],
    queryFn: () =>
      apiFetch<MissionDiscordView>(
        `/api/campaigns/${campaignId}/missions/${mission!.id}/discord${forumId ? `?forumId=${forumId}` : ""}`,
      ),
    enabled: Boolean(mission),
    placeholderData: (previous) => previous,
  });
  const forum = view.data?.forum ?? null;
  const siteUrl = typeof window === "undefined" ? "" : window.location.origin;
  // Enquanto o mestre não edita o texto, ele acompanha o grau digitado.
  const text = content ?? (mission ? missionAnnouncement(mission, grade, siteUrl) : "");

  const publish = useMutation({
    mutationFn: () =>
      apiFetch<MissionSummary>(`/api/campaigns/${campaignId}/missions/${mission!.id}/discord`, {
        method: "POST",
        body: JSON.stringify({
          forumChannelId: forum!.id,
          tagIds,
          content: text,
          personaName: personaName.trim() || null,
          personaAvatarUrl: personaAvatarUrl.trim() || null,
        }),
      }),
    onSuccess: async (updated) => {
      await onPublished(updated);
      await view.refetch();
    },
  });

  function close() {
    if (publish.isPending) return;
    setForumId(null);
    setTagIds([]);
    setContent(null);
    setGrade("");
    publish.reset();
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (forum && text.trim()) publish.mutate();
  }

  const published = Boolean(mission?.discordThreadId || publish.data?.discordThreadId);

  return (
    <Dialog
      open={Boolean(mission)}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={published ? "Missão no Discord" : "Publicar no Discord"}
      description={mission ? mission.title : undefined}
      returnFocusRef={returnFocusRef}
      className="max-w-2xl"
    >
      {view.isError ? (
        <Notice tone="danger" role="alert" title="Não foi possível ler os fóruns do Discord">
          {errorMessage(view.error)}
        </Notice>
      ) : null}

      {published ? (
        <div className="space-y-5">
          <Notice tone="success" role="status" title="O tópico já está no fórum">
            O portal publica cada missão uma vez só. Para mudar o texto, edite o tópico direto no Discord.
          </Notice>
          <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close}>Fechar</Button>
            {view.data?.threadUrl ? (
              <ButtonAnchor variant="primary" href={view.data.threadUrl} target="_blank" rel="noreferrer">
                Abrir no Discord
              </ButtonAnchor>
            ) : null}
          </div>
        </div>
      ) : mission ? (
        <form className="space-y-5" onSubmit={submit}>
          {mission.status !== "published" ? (
            <Notice tone="warning">Publique a missão no portal antes de levá-la ao Discord.</Notice>
          ) : null}
          <Field label="Fórum">
            {({ id }) => (
              <Select
                id={id}
                value={forum?.id ?? ""}
                disabled={!view.data || publish.isPending}
                onChange={(event) => {
                  setForumId(event.target.value);
                  setTagIds([]);
                }}
              >
                {view.isPending ? <option value="">Carregando fóruns…</option> : null}
                {(view.data?.forums ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-fg-muted">
              Tags do fórum <span className="font-normal text-fg-subtle">(até {MAX_TAGS})</span>
            </legend>
            {forum && forum.tags.length === 0 ? (
              <p className="text-sm text-fg-subtle">Este fórum não tem tags.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(forum?.tags ?? []).map((tag) => {
                  const selected = tagIds.includes(tag.id);
                  return (
                    <Button
                      key={tag.id}
                      size="sm"
                      variant={selected ? "primary" : "secondary"}
                      aria-pressed={selected}
                      disabled={publish.isPending || (!selected && tagIds.length >= MAX_TAGS)}
                      onClick={() =>
                        setTagIds((current) => (selected ? current.filter((id) => id !== tag.id) : [...current, tag.id]))
                      }
                    >
                      {tag.name}
                    </Button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-fg-subtle">Aparecem no tópico e servem de filtro no fórum.</p>
          </fieldset>

          <Field label="Grau" optional hint="Quem pode se inscrever, como no chamado: Iniciante e Novato.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                maxLength={120}
                value={grade}
                aria-describedby={describedBy}
                disabled={content !== null}
                onChange={(event) => setGrade(event.target.value)}
              />
            )}
          </Field>

          <Field label="Texto do tópico" hint="Já vem no formato do chamado; edite à vontade. Até 2.000 caracteres.">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                rows={11}
                maxLength={2_000}
                value={text}
                aria-describedby={describedBy}
                onChange={(event) => setContent(event.target.value)}
              />
            )}
          </Field>
          {content !== null ? (
            <Button size="sm" variant="ghost" onClick={() => setContent(null)}>
              Voltar ao texto gerado
            </Button>
          ) : null}

          {mission.coverMediaId ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-muted">Capa do tópico</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(mission.coverMediaId)}
                alt={`Capa de ${mission.title}`}
                className="aspect-[21/9] w-full rounded-md border border-line-soft object-cover"
              />
            </div>
          ) : (
            <Notice tone="info">Sem capa: o tópico fica sem imagem na galeria do fórum. Adicione uma em Editar.</Notice>
          )}

          <FormGrid>
            <Field label="Publicar como" optional hint="Nome narrativo, como Guardião da Chama.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  maxLength={80}
                  value={personaName}
                  aria-describedby={describedBy}
                  onChange={(event) => setPersonaName(event.target.value)}
                />
              )}
            </Field>
            <Field label="Avatar (link HTTPS)" optional>
              {({ id }) => (
                <Input
                  id={id}
                  type="url"
                  inputMode="url"
                  pattern="https://.*"
                  value={personaAvatarUrl}
                  onChange={(event) => setPersonaAvatarUrl(event.target.value)}
                />
              )}
            </Field>
          </FormGrid>

          {publish.isError ? (
            <Notice tone="danger" role="alert">
              {errorMessage(publish.error)}
            </Notice>
          ) : null}
          <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
            <Button disabled={publish.isPending} onClick={close}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!forum || !text.trim() || publish.isPending || mission.status !== "published"}
            >
              {publish.isPending ? "Publicando…" : "Publicar no Discord"}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
