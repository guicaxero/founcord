"use client";

import type { CreatureSpell } from "@ordem/contracts";
import { useMemo, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Notice } from "@/components/ui/notice";
import { errorMessage } from "@/lib/api-client";
import { PanelLoading, SearchField } from "../kit";
import { fetchCompendiumEntry, useCompendium } from "./queries";

const VISIBLE = 40;

/** Escolhe magias do grimório importado para adicionar à criatura. */
export function SpellPicker({
  campaignId,
  open,
  onOpenChange,
  returnFocusRef,
  onPick,
}: Readonly<{
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  onPick: (spell: CreatureSpell) => void;
}>) {
  const grimoire = useCompendium(campaignId, "spell");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [added, setAdded] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const all = grimoire.data?.data ?? [];
    return term
      ? all.filter((entry) => `${entry.name} ${entry.category}`.toLocaleLowerCase("pt-BR").includes(term))
      : all;
  }, [grimoire.data, search]);

  function close() {
    onOpenChange(false);
    setAdded([]);
    setError(null);
  }

  async function pick(entryId: string, name: string) {
    setLoading(entryId);
    setError(null);
    try {
      const entry = await fetchCompendiumEntry(campaignId, entryId);
      if (entry.kind === "spell") {
        onPick(entry.data);
        setAdded((current) => [...current, name]);
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
      title="Adicionar magia do grimório"
      description="A magia entra como uma cópia na criatura; depois dá para ajustar qualquer campo."
      returnFocusRef={returnFocusRef}
      className="max-w-2xl"
      footer={
        <Button variant="primary" onClick={() => close()}>
          Concluir
        </Button>
      }
    >
      {grimoire.isPending ? (
        <PanelLoading label="Carregando o grimório" rows={2} />
      ) : grimoire.isError ? (
        <Notice tone="danger" role="alert">
          {errorMessage(grimoire.error)}
        </Notice>
      ) : grimoire.data.data.length === 0 ? (
        <FeedbackState title="O grimório ainda não foi importado">
          Importe os arquivos da pasta Grimório na aba Compêndio.
        </FeedbackState>
      ) : (
        <div className="space-y-4">
          <SearchField label="Buscar magia" value={search} onChange={setSearch} placeholder="Nome ou tradição" />
          <p className="text-xs text-fg-subtle" aria-live="polite">
            {added.length > 0 ? `Adicionadas: ${added.join(", ")}. ` : null}
            {matches.length > VISIBLE
              ? `Mostrando ${VISIBLE} de ${matches.length}. Refine a busca para ver as demais.`
              : `${matches.length} ${matches.length === 1 ? "magia" : "magias"}.`}
          </p>
          {error ? (
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          ) : null}
          <ul className="max-h-[50dvh] divide-y divide-line-soft overflow-y-auto rounded-md border border-line-soft">
            {matches.slice(0, VISIBLE).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-fg">{entry.name}</span>
                  <span className="block text-xs text-fg-subtle">
                    {[entry.category, entry.rank !== null ? `nível ${entry.rank}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Button
                  size="sm"
                  disabled={loading !== null}
                  aria-label={`Adicionar ${entry.name}`}
                  onClick={() => void pick(entry.id, entry.name)}
                >
                  {loading === entry.id ? "Adicionando…" : "Adicionar"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
