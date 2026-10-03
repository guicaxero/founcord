"use client";

import { useQuery } from "@tanstack/react-query";
import {
  MERCHANT_CONSUMABLE_LABELS,
  type CharacterSheet,
  type CharacterSheetInventoryItem,
  type CharacterSheetSpell,
  type CharacterSheetTalent,
  type PlayerCharacterSheetResponse,
} from "@ordem/contracts";
import { useMemo, useState, type ReactNode } from "react";
import { priceLabel } from "@/components/coins";
import { Button } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Notice } from "@/components/ui/notice";
import { Badge, Skeleton } from "@/components/ui/surface";
import { UrlTabs } from "@/components/ui/tabs";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { NotesSection } from "./notes-section";

/**
 * Ficha completa do personagem vinculado, em seções. A mecânica continua sendo
 * alterada no Foundry; pelo portal, só as anotações.
 */
export function CharacterSheetSections({ campaignId }: Readonly<{ campaignId: string }>) {
  const query = useQuery({
    queryKey: queryKeys.myCharacterSheet(campaignId),
    queryFn: () => apiFetch<PlayerCharacterSheetResponse>(`/api/me/characters/${campaignId}/sheet`),
    // O módulo só grava com o mestre no mundo; enquanto isso, consultamos devagar.
    refetchInterval: (current) => (current.state.data?.notesUpdate?.status === "pending_delivery" ? 10_000 : false),
  });

  if (query.isPending) {
    return (
      <div role="status" aria-label="Carregando a ficha completa">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar a ficha completa"
        tone="error"
        role="alert"
        action={<Button onClick={() => query.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(query.error)}
      </FeedbackState>
    );
  }
  const sheet = query.data.sheet;
  if (!sheet) {
    return (
      <Notice tone="info" title="Ficha completa ainda indisponível">
        Atributos, inventário, magias e talentos aparecem aqui depois que o mestre atualizar o módulo do Foundry
        para a versão 0.11.0 ou mais nova e o personagem for sincronizado.
      </Notice>
    );
  }

  return (
    <UrlTabs
      label="Seções da ficha"
      paramName="ficha"
      tabs={[
        { value: "atributos", label: "Atributos", content: <OverviewSection sheet={sheet} /> },
        {
          value: "inventario",
          label: `Inventário (${sheet.inventory.length})`,
          content: <InventorySection items={sheet.inventory} />,
        },
        {
          value: "magias",
          label: `Magias (${sheet.spells.length})`,
          content: <SpellsSection spells={sheet.spells} />,
        },
        {
          value: "talentos",
          label: `Talentos (${sheet.talents.length})`,
          content: <TalentsSection talents={sheet.talents} />,
        },
        { value: "raizes", label: "Raízes", content: <RootsSection sheet={sheet} /> },
        {
          value: "anotacoes",
          label: "Anotações",
          content: <NotesSection campaignId={campaignId} sheet={sheet} notesUpdate={query.data.notesUpdate} />,
        },
      ]}
    />
  );
}

const ATTRIBUTE_LABELS: readonly Readonly<{ key: keyof CharacterSheet["attributes"]; label: string }>[] = [
  { key: "strength", label: "Força" },
  { key: "agility", label: "Agilidade" },
  { key: "intellect", label: "Intelecto" },
  { key: "will", label: "Vontade" },
  { key: "perception", label: "Percepção" },
];

function modifier(value: number): string {
  const result = value - 10;
  return result > 0 ? `+${result}` : String(result);
}

function SectionTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <h5 className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">{children}</h5>;
}

function OverviewSection({ sheet }: Readonly<{ sheet: CharacterSheet }>) {
  const characteristics = [
    { label: "Defesa", value: sheet.characteristics.defense },
    { label: "Velocidade", value: sheet.characteristics.speed },
    { label: "Poder", value: sheet.characteristics.power },
    { label: "Tamanho", value: sheet.characteristics.size ?? "—" },
    { label: "Fortuna", value: sheet.characteristics.fortune },
  ];
  const appearance = [
    { label: "Idade", value: sheet.appearance.age },
    { label: "Sexo", value: sheet.appearance.sex },
    { label: "Olhos", value: sheet.appearance.eyes },
    { label: "Cabelo", value: sheet.appearance.hair },
    { label: "Altura", value: sheet.appearance.height },
    { label: "Peso", value: sheet.appearance.weight },
    { label: "Traço marcante", value: sheet.appearance.feature },
  ].filter((entry) => entry.value);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionTitle>Atributos</SectionTitle>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line-soft bg-line-soft sm:grid-cols-5">
          {ATTRIBUTE_LABELS.map(({ key, label }) => (
            <div className="bg-surface p-3 text-center" key={key}>
              <dt className="text-xs font-bold text-fg-subtle uppercase">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{sheet.attributes[key]}</dd>
              <dd className="text-xs text-fg-muted tabular-nums" aria-label={`modificador ${modifier(sheet.attributes[key])}`}>
                {modifier(sheet.attributes[key])}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="space-y-3">
        <SectionTitle>Características</SectionTitle>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line-soft bg-line-soft sm:grid-cols-5">
          {characteristics.map((entry) => (
            <div className="bg-surface p-3 text-center" key={entry.label}>
              <dt className="text-xs font-bold text-fg-subtle uppercase">{entry.label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {appearance.length > 0 || sheet.religion ? (
        <section className="space-y-3">
          <SectionTitle>Aparência</SectionTitle>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sheet.religion ? <Detail label="Religião" value={sheet.religion} /> : null}
            {appearance.map((entry) => (
              <Detail key={entry.label} label={entry.label} value={entry.value!} />
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-md bg-surface-2 px-3 py-2">
      <dt className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}

/** Lista recolhível com nome, resumo e descrição; vazia mostra a mensagem. */
function EntryList<T extends Readonly<{ id: string; name: string; description: string }>>({
  entries,
  empty,
  summary,
  badges,
}: Readonly<{
  entries: readonly T[];
  empty: string;
  summary: (entry: T) => string;
  badges?: ((entry: T) => ReactNode) | undefined;
}>) {
  if (entries.length === 0) {
    return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const line = summary(entry);
        return (
          <li key={entry.id}>
            <details className="group rounded-md border border-line-soft bg-surface-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{entry.name}</span>
                    {badges?.(entry)}
                  </span>
                  {line ? <span className="block text-xs text-fg-subtle">{line}</span> : null}
                </span>
                <span aria-hidden="true" className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="border-t border-line-soft px-4 py-3 text-sm whitespace-pre-line text-fg-muted">
                {entry.description || "Sem descrição."}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

const INVENTORY_FILTERS = [
  { value: "all", label: "Tudo" },
  { value: "weapon", label: "Armas" },
  { value: "armor", label: "Armaduras" },
  { value: "item", label: "Itens" },
  { value: "ammo", label: "Munição" },
  { value: "relic", label: "Relíquias" },
] as const;
type InventoryFilter = (typeof INVENTORY_FILTERS)[number]["value"];

const HANDS_LABELS: Readonly<Record<string, string>> = { one: "Uma mão", two: "Duas mãos", off: "Mão secundária" };
const handsLabel = (value: string | null) => (value ? (HANDS_LABELS[value] ?? value) : null);
const consumableLabel = (value: string | null) =>
  value ? ((MERCHANT_CONSUMABLE_LABELS as Readonly<Record<string, string>>)[value] ?? value) : null;

function InventorySection({ items }: Readonly<{ items: readonly CharacterSheetInventoryItem[] }>) {
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const visible = useMemo(() => (filter === "all" ? items : items.filter((item) => item.type === filter)), [filter, items]);
  const options = INVENTORY_FILTERS.filter(
    (option) => option.value === "all" || items.some((item) => item.type === option.value),
  ).map((option) => ({
    ...option,
    count: option.value === "all" ? items.length : items.filter((item) => item.type === option.value).length,
  }));

  return (
    <div className="space-y-4">
      {items.length > 0 ? <FilterChips label="Tipo de item" value={filter} onChange={setFilter} options={options} /> : null}
      <EntryList
        entries={visible}
        empty="Nenhum item no inventário."
        summary={(item) =>
          [
            item.quantity !== 1 ? `${item.quantity} unidades` : null,
            item.damage ? `Dano ${item.damage}` : null,
            item.defense,
            handsLabel(item.hands),
            consumableLabel(item.consumableType),
            item.properties,
            item.price ? priceLabel(item.price) : null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
        badges={(item) => (item.equipped && (item.type === "weapon" || item.type === "armor") ? <Badge tone="success">Equipado</Badge> : null)}
      />
    </div>
  );
}

function resource(label: string, value: Readonly<{ value: number | null; max: number | null }>): string | null {
  if (value.max === null && value.value === null) return null;
  return value.max === null ? `${label} ${value.value}` : `${label} ${value.value ?? 0}/${value.max}`;
}

function SpellsSection({ spells }: Readonly<{ spells: readonly CharacterSheetSpell[] }>) {
  const byTradition = useMemo(() => {
    const groups = new Map<string, CharacterSheetSpell[]>();
    for (const spell of [...spells].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "pt-BR"))) {
      const key = spell.tradition ?? "Sem tradição";
      groups.set(key, [...(groups.get(key) ?? []), spell]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [spells]);

  if (spells.length === 0) {
    return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">Nenhuma magia conhecida.</p>;
  }
  return (
    <div className="space-y-6">
      {byTradition.map(([tradition, list]) => (
        <section key={tradition} className="space-y-3">
          <SectionTitle>{tradition}</SectionTitle>
          <EntryList
            entries={list}
            empty=""
            summary={(spell) =>
              [
                `Nível ${spell.rank}`,
                spell.spellType === "attack" ? "Ataque" : spell.spellType === "utility" ? "Utilidade" : null,
                resource("Conjurações", spell.castings),
                spell.target ? `Alvo: ${spell.target}` : null,
                spell.area ? `Área: ${spell.area}` : null,
                spell.duration ? `Duração: ${spell.duration}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            }
          />
        </section>
      ))}
    </div>
  );
}

const TALENT_KIND_LABELS: Readonly<Record<CharacterSheetTalent["kind"], string>> = {
  talent: "Talento",
  feature: "Característica",
  specialaction: "Ação especial",
};

function TalentsSection({ talents }: Readonly<{ talents: readonly CharacterSheetTalent[] }>) {
  const groups = useMemo(() => {
    const map = new Map<string, CharacterSheetTalent[]>();
    for (const talent of talents) {
      const key = talent.group ?? "Outros";
      map.set(key, [...(map.get(key) ?? []), talent]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "Outros" ? 1 : b === "Outros" ? -1 : a.localeCompare(b, "pt-BR")));
  }, [talents]);

  if (talents.length === 0) {
    return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">Nenhum talento registrado.</p>;
  }
  return (
    <div className="space-y-6">
      {groups.map(([group, list]) => (
        <section key={group} className="space-y-3">
          <SectionTitle>{group}</SectionTitle>
          <EntryList
            entries={list}
            empty=""
            summary={(talent) => [TALENT_KIND_LABELS[talent.kind], resource("Usos", talent.uses)].filter(Boolean).join(" · ")}
          />
        </section>
      ))}
    </div>
  );
}

function RootsSection({ sheet }: Readonly<{ sheet: CharacterSheet }>) {
  const { ancestry, professions, languages } = sheet.roots;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionTitle>Ancestralidade</SectionTitle>
        {ancestry ? (
          <EntryList entries={[{ id: "ancestry", ...ancestry }]} empty="" summary={() => ""} />
        ) : (
          <p className="text-sm text-fg-muted">Nenhuma ancestralidade na ficha.</p>
        )}
      </section>
      <section className="space-y-3">
        <SectionTitle>Profissões</SectionTitle>
        <EntryList
          entries={professions.map((profession, index) => ({ id: `profession-${index}`, ...profession }))}
          empty="Nenhuma profissão na ficha."
          summary={() => ""}
        />
      </section>
      <section className="space-y-3">
        <SectionTitle>Idiomas</SectionTitle>
        {languages.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhum idioma na ficha.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {languages.map((language) => {
              const skills = [language.speak ? "fala" : null, language.read ? "lê" : null, language.write ? "escreve" : null].filter(Boolean);
              return (
                <li key={language.name} className="rounded-md border border-line-soft bg-surface-2 px-3 py-2 text-sm">
                  <span className="font-semibold text-fg">{language.name}</span>
                  {skills.length > 0 ? <span className="text-fg-subtle"> · {skills.join(", ")}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
