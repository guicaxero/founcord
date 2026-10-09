"use client";

import type { MerchantCatalogItem } from "@ordem/contracts";
import { useMemo, useState } from "react";
import { priceLabel } from "@/components/coins";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/surface";
import { PanelHeader, SearchField } from "../kit";
import { availabilityLabel, availabilityTone, combatSummary } from "./presentation";

const VISIBLE_RESULTS = 40;

/**
 * Busca no catálogo ativo, com "Adicionar" em cada item. `blockedLabel` diz por
 * que um item não pode entrar (ex.: "Na seleção"); `null` libera o botão.
 */
export function CatalogPicker({
  catalog,
  blockedLabel,
  full,
  onAdd,
}: Readonly<{
  catalog: readonly MerchantCatalogItem[];
  blockedLabel: (item: MerchantCatalogItem) => string | null;
  full: boolean;
  onAdd: (item: MerchantCatalogItem) => void;
}>) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(
    () => [...new Set(catalog.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [catalog],
  );
  const results = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return catalog.filter(
      (item) =>
        (!category || item.category === category) &&
        (!term || `${item.name} ${item.category}`.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [catalog, category, search]);

  return (
    <Card className="min-w-0 space-y-4">
      <PanelHeader as="h3" title="Catálogo" description={`${catalog.length} itens ativos.`} />
      <div className="flex flex-wrap items-end gap-3">
        <SearchField label="Buscar item" value={search} onChange={setSearch} placeholder="Nome ou categoria" />
        <Field label="Categoria" className="w-full sm:w-56">
          {({ id }) => (
            <Select id={id} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Todas</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <p className="text-xs text-fg-subtle" aria-live="polite">
        {results.length > VISIBLE_RESULTS
          ? `Mostrando ${VISIBLE_RESULTS} de ${results.length}. Refine a busca para ver os demais.`
          : `${results.length} ${results.length === 1 ? "item" : "itens"}.`}
      </p>
      {results.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
          Nenhum item encontrado. Tente outro termo ou outra categoria.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-md border border-line-soft">
          {results.slice(0, VISIBLE_RESULTS).map((item) => {
            const blocked = blockedLabel(item);
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <ItemLabel item={item} />
                <Button
                  size="sm"
                  variant={blocked ? "ghost" : "secondary"}
                  disabled={Boolean(blocked) || full}
                  aria-label={blocked ? `${item.name}: ${blocked}` : `Adicionar ${item.name}`}
                  onClick={() => onAdd(item)}
                >
                  {blocked ?? "Adicionar"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function ItemLabel({ item }: Readonly<{ item: MerchantCatalogItem }>) {
  const combat = combatSummary(item);
  return (
    <span className="min-w-0 flex-1 space-y-1">
      <span className="block truncate font-semibold text-fg">{item.name}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
        <Badge tone={availabilityTone[item.availability]} className="px-2 py-0.5">
          {availabilityLabel(item.availability)}
        </Badge>
        <span>{item.category}</span>
        <span>{item.price ? priceLabel(item.price) : "Sem preço"}</span>
        {combat !== "—" ? <span>{combat}</span> : null}
      </span>
    </span>
  );
}

/** Quantidade inteira entre `min` e `max`, com texto livre enquanto se digita. */
export function QuantityInput({
  label,
  value,
  onChange,
  min = 1,
  max = 100,
}: Readonly<{ label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }>) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(String(value));
  }
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      aria-label={label}
      className="w-20 tabular-nums"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number.parseInt(event.target.value, 10);
        if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
          setShown(parsed);
          onChange(parsed);
        }
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
