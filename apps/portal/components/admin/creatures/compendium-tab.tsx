"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  CREATURE_DIFFICULTIES,
  type CompendiumEntrySummary,
  type CompendiumImportResponse,
  type CompendiumKind,
} from "@ordem/contracts";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Select } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { Notice } from "@/components/ui/notice";
import { Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader, PanelLoading, SearchField } from "../kit";
import type { CreatureNavigation } from "./creatures-panel";
import { fetchCompendiumEntry, useCompendium, useCreateCreature } from "./queries";

const BATCH_SIZE = 30;

type Skipped = Readonly<{ fileName: string; reason: string }>;
type ImportState =
  | Readonly<{ phase: "idle" }>
  | Readonly<{ phase: "running"; done: number; total: number }>
  | Readonly<{
      phase: "done";
      creatures: CompendiumImportResponse;
      spells: CompendiumImportResponse;
      skipped: readonly Skipped[];
    }>
  | Readonly<{ phase: "error"; message: string }>;

const emptyResult: CompendiumImportResponse = { created: 0, updated: 0, skipped: [] };

/** Lê os arquivos escolhidos e separa criaturas e magias pelo tipo do documento. */
async function readExports(files: readonly File[]) {
  const byKind: Record<CompendiumKind, { fileName: string; content: unknown }[]> = { creature: [], spell: [] };
  const skipped: Skipped[] = [];
  for (const file of files) {
    // Manifestos e arquivos que não são JSON ficam de fora sem aviso.
    if (!file.name.toLowerCase().endsWith(".json") || file.name.startsWith("_")) continue;
    try {
      const content: unknown = JSON.parse(await file.text());
      const type = content && typeof content === "object" ? (content as { type?: unknown }).type : undefined;
      if (type === "creature" || type === "spell") byKind[type].push({ fileName: file.name, content });
      else skipped.push({ fileName: file.name, reason: "Não é uma criatura nem uma magia." });
    } catch {
      skipped.push({ fileName: file.name, reason: "O arquivo não é um JSON válido." });
    }
  }
  return { byKind, skipped };
}

export function CompendiumTab({
  campaignId,
  navigation,
}: Readonly<{ campaignId: string; navigation: CreatureNavigation }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<CompendiumKind>("creature");
  const bestiary = useCompendium(campaignId, "creature");
  const grimoire = useCompendium(campaignId, "spell");
  const create = useCreateCreature(campaignId);
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" });
  const [usingEntry, setUsingEntry] = useState<string | null>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    const { byKind, skipped } = await readExports(files);
    const total = byKind.creature.length + byKind.spell.length;
    if (total === 0) {
      setImportState({
        phase: "error",
        message: "Nenhum arquivo de criatura ou magia foi encontrado. Escolha os JSON das pastas Bestiário e Grimório.",
      });
      return;
    }
    const results: Record<CompendiumKind, CompendiumImportResponse> = { creature: emptyResult, spell: emptyResult };
    let done = 0;
    setImportState({ phase: "running", done, total });
    try {
      for (const current of ["creature", "spell"] as const) {
        const list = byKind[current];
        for (let start = 0; start < list.length; start += BATCH_SIZE) {
          const batch = list.slice(start, start + BATCH_SIZE);
          const response = await apiFetch<CompendiumImportResponse>(`/api/campaigns/${campaignId}/compendium/import`, {
            method: "POST",
            body: JSON.stringify({ kind: current, files: batch }),
          });
          results[current] = {
            created: results[current].created + response.created,
            updated: results[current].updated + response.updated,
            skipped: [...results[current].skipped, ...response.skipped],
          };
          done += batch.length;
          setImportState({ phase: "running", done, total });
        }
      }
      setImportState({ phase: "done", creatures: results.creature, spells: results.spell, skipped });
    } catch (error) {
      setImportState({
        phase: "error",
        message: `${errorMessage(error)} ${done > 0 ? `${done} de ${total} arquivos foram importados antes da falha; importar de novo não duplica nada.` : ""}`.trim(),
      });
    } finally {
      await Promise.all(
        (["creature", "spell"] as const).map((current) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.compendium(campaignId, current) }),
        ),
      );
    }
  }

  async function startFromEntry(entry: CompendiumEntrySummary) {
    setUsingEntry(entry.id);
    try {
      const full = await fetchCompendiumEntry(campaignId, entry.id);
      if (full.kind !== "creature") return;
      const creature = await create.mutateAsync({ draft: full.data, basedOnEntryId: full.id });
      navigation.openCreature(creature.id);
    } catch (error) {
      toast({ title: "Não foi possível criar a criatura", description: errorMessage(error), tone: "danger" });
    } finally {
      setUsingEntry(null);
    }
  }

  const running = importState.phase === "running";
  const active = kind === "creature" ? bestiary : grimoire;

  return (
    <div className="space-y-8">
      <Card className="space-y-5">
        <PanelHeader
          eyebrow="Importação"
          title="Importar do compêndio"
          description="Escolha os arquivos .json das pastas Bestiário e Grimório do compêndio, ou a pasta inteira. Importar de novo atualiza o que já existe, sem duplicar."
          actions={
            <>
              <Button variant="accent" disabled={running} onClick={() => filesInput.current?.click()}>
                Escolher arquivos
              </Button>
              <Button disabled={running} onClick={() => folderInput.current?.click()}>
                Escolher pasta
              </Button>
            </>
          }
        />
        <input
          ref={filesInput}
          type="file"
          accept=".json,application/json"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={importFiles}
        />
        <input
          ref={(element) => {
            folderInput.current = element;
            element?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={importFiles}
        />
        <p className="text-xs text-fg-subtle">
          O conteúdo importado fica visível só para quem gerencia criaturas nesta campanha.
        </p>
        <ImportStatus state={importState} />
      </Card>

      <section className="space-y-4" aria-labelledby="compendium-list-title">
        <PanelHeader
          id="compendium-list-title"
          eyebrow="Compêndio da campanha"
          title={kind === "creature" ? "Bestiário" : "Grimório"}
          description={
            kind === "creature"
              ? "Use uma criatura como base: ela vira uma cópia editável na biblioteca."
              : "As magias ficam disponíveis no editor, na seção de magias da criatura."
          }
        />
        <FilterChips
          label="Parte do compêndio"
          value={kind}
          onChange={setKind}
          options={[
            { value: "creature", label: "Bestiário", count: bestiary.data?.data.length },
            { value: "spell", label: "Grimório", count: grimoire.data?.data.length },
          ]}
        />
        {active.isPending ? (
          <PanelLoading label="Carregando o compêndio" />
        ) : active.isError ? (
          <FeedbackState
            title="Não foi possível carregar o compêndio"
            tone="error"
            role="alert"
            action={<Button onClick={() => active.refetch()}>Tentar novamente</Button>}
          >
            {errorMessage(active.error)}
          </FeedbackState>
        ) : active.data.data.length === 0 ? (
          <FeedbackState
            title={kind === "creature" ? "O bestiário ainda não foi importado" : "O grimório ainda não foi importado"}
            action={
              <Button variant="accent" onClick={() => filesInput.current?.click()}>
                {kind === "creature" ? "Importar bestiário" : "Importar grimório"}
              </Button>
            }
          >
            Selecione os arquivos da pasta {kind === "creature" ? "Bestiário" : "Grimório"} do compêndio.
          </FeedbackState>
        ) : kind === "creature" ? (
          <BestiaryTable
            entries={active.data.data}
            usingEntry={usingEntry}
            onUse={(entry) => void startFromEntry(entry)}
          />
        ) : (
          <GrimoireTable entries={active.data.data} />
        )}
      </section>
    </div>
  );
}

function ImportStatus({ state }: Readonly<{ state: ImportState }>) {
  if (state.phase === "idle") return null;
  if (state.phase === "running") {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <p className="text-sm text-fg-muted">
          Importando {state.done} de {state.total} arquivos…
        </p>
        <progress
          className="h-2 w-full overflow-hidden rounded-full accent-accent"
          max={state.total}
          value={state.done}
          aria-label="Progresso da importação"
        />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <Notice tone="danger" role="alert" title="A importação não terminou">
        {state.message}
      </Notice>
    );
  }
  const skipped = [...state.skipped, ...state.creatures.skipped, ...state.spells.skipped];
  const summary = (label: string, result: CompendiumImportResponse) => {
    const total = result.created + result.updated;
    return total === 0 ? null : `${total} ${label} (${result.created} novas, ${result.updated} atualizadas)`;
  };
  const parts = [summary("criaturas", state.creatures), summary("magias", state.spells)].filter(Boolean);
  return (
    <Notice tone={parts.length > 0 ? "success" : "warning"} role="status" title="Importação concluída">
      <p>{parts.length > 0 ? `${parts.join(" e ")}.` : "Nenhum arquivo foi importado."}</p>
      {skipped.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold">
            {skipped.length} {skipped.length === 1 ? "arquivo ignorado" : "arquivos ignorados"}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {skipped.map((item) => (
              <li key={item.fileName}>
                {item.fileName}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Notice>
  );
}

function BestiaryTable({
  entries,
  usingEntry,
  onUse,
}: Readonly<{
  entries: readonly CompendiumEntrySummary[];
  usingEntry: string | null;
  onUse: (entry: CompendiumEntrySummary) => void;
}>) {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return entries.filter(
      (entry) =>
        (difficulty === "all" || entry.difficulty === Number(difficulty)) &&
        (!term || `${entry.name} ${entry.category}`.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [difficulty, entries, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <SearchField label="Buscar no bestiário" value={search} onChange={setSearch} placeholder="Nome ou descritor" />
        <Field label="Dificuldade" className="w-full sm:w-44">
          {({ id }) => (
            <Select id={id} value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="all">Todas</option>
              {CREATURE_DIFFICULTIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <DataTable
        caption="Criaturas do bestiário"
        rows={rows}
        rowKey={(entry) => entry.id}
        initialSort={{ column: "name", direction: "ascending" }}
        empty={<FeedbackState title="Nenhuma criatura encontrada">Tente outro termo ou outra dificuldade.</FeedbackState>}
        columns={[
          {
            id: "name",
            header: "Criatura",
            hideLabelOnMobile: true,
            sortValue: (entry) => entry.name,
            cell: (entry) => (
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-fg">{entry.name}</p>
                {entry.category ? <p className="text-xs text-fg-subtle">{entry.category}</p> : null}
              </div>
            ),
          },
          {
            id: "difficulty",
            header: "Dificuldade",
            className: "md:w-28 tabular-nums",
            sortValue: (entry) => entry.difficulty ?? 0,
            cell: (entry) => entry.difficulty ?? "—",
          },
          {
            id: "stats",
            header: "Defesa / Vida",
            className: "md:w-32 tabular-nums text-fg-muted",
            cell: (entry) => `${entry.defense ?? "—"} / ${entry.health ?? "—"}`,
          },
          {
            id: "actions",
            header: "Ações",
            hideLabelOnMobile: true,
            className: "md:w-44",
            cell: (entry) => (
              <Button
                size="sm"
                variant="secondary"
                disabled={usingEntry !== null}
                aria-label={`Usar ${entry.name} como base`}
                onClick={() => onUse(entry)}
              >
                {usingEntry === entry.id ? "Criando…" : "Usar como base"}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}

function GrimoireTable({ entries }: Readonly<{ entries: readonly CompendiumEntrySummary[] }>) {
  const [search, setSearch] = useState("");
  const [tradition, setTradition] = useState("all");
  const traditions = useMemo(
    () => [...new Set(entries.map((entry) => entry.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [entries],
  );
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return entries.filter(
      (entry) =>
        (tradition === "all" || entry.category === tradition) &&
        (!term || entry.name.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [entries, search, tradition]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <SearchField label="Buscar no grimório" value={search} onChange={setSearch} placeholder="Nome da magia" />
        <Field label="Tradição" className="w-full sm:w-56">
          {({ id }) => (
            <Select id={id} value={tradition} onChange={(event) => setTradition(event.target.value)}>
              <option value="all">Todas</option>
              {traditions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <DataTable
        caption="Magias do grimório"
        rows={rows}
        rowKey={(entry) => entry.id}
        initialSort={{ column: "name", direction: "ascending" }}
        empty={<FeedbackState title="Nenhuma magia encontrada">Tente outro termo ou outra tradição.</FeedbackState>}
        columns={[
          {
            id: "name",
            header: "Magia",
            hideLabelOnMobile: true,
            sortValue: (entry) => entry.name,
            cell: (entry) => <p className="font-semibold text-fg">{entry.name}</p>,
          },
          {
            id: "tradition",
            header: "Tradição",
            className: "md:w-56 text-fg-muted",
            sortValue: (entry) => entry.category,
            cell: (entry) => entry.category || "—",
          },
          {
            id: "rank",
            header: "Nível",
            className: "md:w-20 tabular-nums",
            sortValue: (entry) => entry.rank ?? 0,
            cell: (entry) => entry.rank ?? "—",
          },
        ]}
      />
    </div>
  );
}
