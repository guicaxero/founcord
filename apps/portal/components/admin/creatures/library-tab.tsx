"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CREATURE_DIFFICULTIES,
  blankCreatureDraft,
  type CompendiumEntrySummary,
  type Creature,
  type CreatureDifficulty,
} from "@ordem/contracts";
import { useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, RowActions } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader, PanelLoading, SearchField, Stats } from "../kit";
import { timestamp } from "../status";
import type { CreatureNavigation } from "./creatures-panel";
import { creatureSituation } from "./presentation";
import { useCompendium, useCreateCreature, useCreatures } from "./queries";

export function LibraryTab({
  campaignId,
  navigation,
}: Readonly<{ campaignId: string; navigation: CreatureNavigation }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const creatures = useCreatures(campaignId);
  const bestiary = useCompendium(campaignId, "creature");
  const create = useCreateCreature(campaignId);
  const newTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Creature | null>(null);
  const [search, setSearch] = useState("");

  const remove = useMutation({
    mutationFn: (creatureId: string) =>
      apiFetch(`/api/campaigns/${campaignId}/creatures/${creatureId}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast({ title: "Criatura excluída da biblioteca", tone: "info" });
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.creatures(campaignId) });
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const all = creatures.data?.data ?? [];
    return term
      ? all.filter((creature) =>
          `${creature.draft.name} ${creature.draft.descriptor}`.toLocaleLowerCase("pt-BR").includes(term),
        )
      : all;
  }, [creatures.data, search]);

  if (creatures.isPending) return <PanelLoading label="Carregando a biblioteca de criaturas" />;
  if (creatures.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar a biblioteca"
        tone="error"
        role="alert"
        action={<Button onClick={() => creatures.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(creatures.error)}
      </FeedbackState>
    );
  }

  const all = creatures.data.data;
  const inFoundry = all.filter((creature) => creature.status === "synced").length;
  const duplicate = (creature: Creature) =>
    create.mutate(
      {
        draft: { ...creature.draft, name: `${creature.draft.name} (cópia)`.slice(0, 120) },
        basedOnEntryId: creature.basedOn?.entryId ?? null,
      },
      {
        onSuccess: (copy) => navigation.openCreature(copy.id),
        onError: (error) => toast({ title: "Não foi possível duplicar", description: errorMessage(error), tone: "danger" }),
      },
    );

  return (
    <div className="space-y-8">
      <PanelHeader
        eyebrow="Biblioteca da campanha"
        title={all.length === 0 ? "Nenhuma criatura ainda" : `${all.length} ${all.length === 1 ? "criatura" : "criaturas"}`}
        description="Edite, envie ao Foundry e reenvie quando mudar algo: o ator no Foundry é atualizado, não duplicado."
        actions={
          <Button ref={newTriggerRef} variant="accent" onClick={() => setCreating(true)}>
            Nova criatura
          </Button>
        }
      />

      {all.length > 0 ? (
        <Stats
          label="Resumo da biblioteca"
          items={[
            { label: "Criaturas", value: all.length },
            { label: "No Foundry", value: inFoundry },
            {
              label: "Bestiário importado",
              value: bestiary.data?.data.length ?? "—",
              hint: "Base para novas criaturas",
            },
          ]}
        />
      ) : null}

      {all.length === 0 ? (
        <FeedbackState
          title="Nenhuma criatura na biblioteca"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="accent" onClick={() => setCreating(true)}>
                Criar do zero
              </Button>
              <Button onClick={() => navigation.openTab("compendio")}>Escolher do bestiário</Button>
            </div>
          }
        >
          Comece com uma ficha em branco ou use uma criatura do bestiário importado como base.
        </FeedbackState>
      ) : (
        <section className="space-y-4" aria-label="Lista de criaturas">
          <SearchField label="Buscar criatura" value={search} onChange={setSearch} placeholder="Nome ou descritor" />
          <DataTable
            caption="Criaturas da campanha"
            rows={rows}
            rowKey={(creature) => creature.id}
            initialSort={{ column: "updated", direction: "descending" }}
            empty={<FeedbackState title="Nenhuma criatura encontrada">Tente outro termo de busca.</FeedbackState>}
            columns={[
              {
                id: "name",
                header: "Criatura",
                hideLabelOnMobile: true,
                sortValue: (creature) => creature.draft.name,
                cell: (creature) => (
                  <div className="min-w-0 space-y-1">
                    <button
                      type="button"
                      className="text-left font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      onClick={() => navigation.openCreature(creature.id)}
                    >
                      {creature.draft.name}
                    </button>
                    <p className="text-xs text-fg-subtle">
                      {[creature.draft.descriptor, creature.basedOn ? `baseada em ${creature.basedOn.name}` : null]
                        .filter(Boolean)
                        .join(" · ") || "Sem descritor"}
                    </p>
                  </div>
                ),
              },
              {
                id: "difficulty",
                header: "Dificuldade",
                className: "md:w-28 tabular-nums",
                sortValue: (creature) => creature.draft.difficulty,
                cell: (creature) => creature.draft.difficulty,
              },
              {
                id: "stats",
                header: "Defesa / Vida",
                className: "md:w-32 tabular-nums text-fg-muted",
                cell: (creature) => `${creature.draft.defense} / ${creature.draft.health}`,
              },
              {
                id: "status",
                header: "Foundry",
                className: "md:w-48",
                cell: (creature) => {
                  const situation = creatureSituation(creature);
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={situation.tone}>{situation.label}</Badge>
                      {situation.outdated ? <Badge tone="warning">Alterações não enviadas</Badge> : null}
                    </div>
                  );
                },
              },
              {
                id: "updated",
                header: "Atualizada",
                className: "md:w-44 whitespace-nowrap text-fg-muted",
                sortValue: (creature) => timestamp(creature.updatedAt),
                cell: (creature) => formatDateTime(creature.updatedAt),
              },
              {
                id: "actions",
                header: "Ações",
                hideLabelOnMobile: true,
                className: "md:w-64",
                cell: (creature) => (
                  <RowActions>
                    <Button size="sm" variant="secondary" onClick={() => navigation.openCreature(creature.id)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" disabled={create.isPending} onClick={() => duplicate(creature)}>
                      Duplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        deleteTriggerRef.current = event.currentTarget;
                        remove.reset();
                        setDeleting(creature);
                      }}
                    >
                      Excluir
                    </Button>
                  </RowActions>
                ),
              },
            ]}
          />
        </section>
      )}

      <NewCreatureDialog
        open={creating}
        onOpenChange={setCreating}
        bestiary={bestiary.data?.data ?? []}
        busy={create.isPending}
        error={create.isError ? errorMessage(create.error) : null}
        returnFocusRef={newTriggerRef}
        onPickFromBestiary={() => {
          setCreating(false);
          navigation.openTab("compendio");
        }}
        onCreate={(name, difficulty) =>
          create.mutate(
            {
              draft: { ...blankCreatureDraft(difficulty, bestiary.data?.data ?? []), name },
              basedOnEntryId: null,
            },
            {
              onSuccess: (creature) => {
                setCreating(false);
                navigation.openCreature(creature.id);
              },
            },
          )
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Excluir ${deleting?.draft.name ?? "a criatura"}?`}
        description="A criatura sai da biblioteca do portal. O ator que já estiver no Foundry continua lá."
        confirmLabel="Excluir criatura"
        busyLabel="Excluindo…"
        confirmationText="EXCLUIR"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        returnFocusRef={deleteTriggerRef}
      />
    </div>
  );
}

function NewCreatureDialog({
  open,
  onOpenChange,
  bestiary,
  busy,
  error,
  returnFocusRef,
  onPickFromBestiary,
  onCreate,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bestiary: readonly CompendiumEntrySummary[];
  busy: boolean;
  error: string | null;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onPickFromBestiary: () => void;
  onCreate: (name: string, difficulty: CreatureDifficulty) => void;
}>) {
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState<CreatureDifficulty>(10);
  const suggestion = blankCreatureDraft(difficulty, bestiary);
  const peers = bestiary.filter((entry) => entry.difficulty === difficulty).length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length >= 2) onCreate(name.trim(), difficulty);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      title="Nova criatura"
      description="Crie uma ficha em branco com valores sugeridos, ou escolha uma criatura do bestiário como base."
      returnFocusRef={returnFocusRef}
      className="max-w-lg"
    >
      <form className="space-y-5" onSubmit={submit}>
        <Field label="Nome" hint="Pelo menos 2 caracteres.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              autoComplete="off"
            />
          )}
        </Field>
        <Field
          label="Dificuldade"
          hint={
            peers > 0
              ? `Defesa ${suggestion.defense} e Vida ${suggestion.health}, pela mediana de ${peers} ${peers === 1 ? "criatura" : "criaturas"} do bestiário com essa dificuldade.`
              : "Sem criaturas do bestiário nessa dificuldade: a ficha começa com a base humana (atributos 10, Defesa 10, Vida 10)."
          }
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={difficulty}
              onChange={(event) => setDifficulty(Number(event.target.value) as CreatureDifficulty)}
            >
              {CREATURE_DIFFICULTIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error ? (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        ) : null}
        <div className="flex flex-wrap justify-between gap-2 border-t border-line-soft pt-4">
          <Button variant="ghost" onClick={onPickFromBestiary}>
            Escolher do bestiário
          </Button>
          <Button type="submit" variant="primary" disabled={busy || name.trim().length < 2}>
            {busy ? "Criando…" : "Criar do zero"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
