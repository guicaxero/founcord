import {
  MERCHANT_AVAILABILITY_LABELS,
  type MerchantCatalogItemInput,
  type MerchantCatalogKind,
  type MerchantItemAvailability,
  type MerchantStockCriteria,
  type MerchantStockDrawStatus,
} from "@ordem/contracts";
import type { Tone } from "../status";

export const availabilityTone: Readonly<Record<MerchantItemAvailability, Tone>> = {
  common: "neutral",
  uncommon: "info",
  rare: "warning",
  exotic: "accent",
};

/** Rótulos do teto de disponibilidade, como na planilha. */
export const ceilingOptions: readonly Readonly<{ value: MerchantItemAvailability; label: string; hint: string }>[] = [
  { value: "common", label: "Comum", hint: "Só itens comuns." },
  { value: "uncommon", label: "Até Incomum", hint: "Comuns e incomuns." },
  { value: "rare", label: "Até Raro", hint: "Comuns, incomuns e raros." },
  { value: "exotic", label: "Até Exótico", hint: "Todas as disponibilidades." },
];

export const kindLabels: Readonly<Record<MerchantCatalogKind, string>> = {
  weapon: "Arma",
  armor: "Armadura",
  item: "Item",
};

export const handsLabels = { one: "Uma mão", two: "Duas mãos", off: "Mão secundária" } as const;

export const attributeLabels = {
  strength: "Força",
  agility: "Agilidade",
  intellect: "Intelecto",
  will: "Vontade",
  perception: "Percepção",
} as const;

export const drawStatusContent: Readonly<
  Record<MerchantStockDrawStatus, Readonly<{ label: string; tone: Tone }>>
> = {
  preview: { label: "Prévia", tone: "neutral" },
  pending_delivery: { label: "Aguardando o Foundry", tone: "info" },
  applied: { label: "Aplicado no Foundry", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
  discarded: { label: "Descartado", tone: "neutral" },
};

type ItemFields = Pick<
  MerchantCatalogItemInput,
  "kind" | "damage" | "hands" | "agility" | "fixed" | "requirement"
>;

/** Dano da arma ou defesa da armadura, em uma linha curta. */
export function combatSummary(item: ItemFields): string {
  if (item.kind === "weapon") return item.damage ? `Dano ${item.damage}` : "—";
  if (item.kind === "armor") {
    if (item.fixed) return `Defesa ${item.fixed}`;
    if (item.agility) return `Agilidade +${item.agility}`;
    return "Defesa = Agilidade";
  }
  return "—";
}

/** Empunhadura e requisito, em uma linha curta. */
export function handlingSummary(item: ItemFields): string {
  const parts = [
    item.hands ? handsLabels[item.hands] : null,
    item.requirement ? `${attributeLabels[item.requirement.attribute]} ${item.requirement.minimum}+` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function availabilityLabel(value: MerchantItemAvailability): string {
  return MERCHANT_AVAILABILITY_LABELS[value];
}

/** "Até Raro · Armas à Distância e Escudos · 10 itens · com repetição" */
export function criteriaSummary(criteria: MerchantStockCriteria): string {
  const ceiling = ceilingOptions.find((option) => option.value === criteria.maxAvailability)?.label ?? "";
  const categories =
    criteria.categories.length === 0
      ? "todas as categorias"
      : criteria.categories.length <= 2
        ? criteria.categories.join(" e ")
        : `${criteria.categories.length} categorias`;
  return [
    ceiling,
    categories,
    `${criteria.quantity} ${criteria.quantity === 1 ? "item" : "itens"}`,
    criteria.allowRepeat ? "com repetição" : "sem repetição",
  ].join(" · ");
}
