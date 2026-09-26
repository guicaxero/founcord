"use client";

import {
  MERCHANT_AVAILABILITY_LABELS,
  MERCHANT_CONSUMABLE_LABELS,
  type MerchantArmorDetails,
  type MerchantItemAvailability,
  type MerchantItemProjection,
  type MerchantWeaponDetails,
} from "@ordem/contracts";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

/** A cor reforça a raridade; o nome do livro continua sendo o significado. */
const availabilityTone: Readonly<Record<MerchantItemAvailability, "neutral" | "info" | "warning" | "accent">> = {
  common: "neutral",
  uncommon: "info",
  rare: "warning",
  exotic: "accent",
};

const handsLabels: Readonly<Record<NonNullable<MerchantWeaponDetails["hands"]>, string>> = {
  one: "Uma mão",
  two: "Duas mãos",
  off: "Mão secundária",
};

const attributeLabels: Readonly<
  Record<NonNullable<MerchantWeaponDetails["requirement"]>["attribute"], string>
> = {
  strength: "Força",
  agility: "Agilidade",
  intellect: "Intelecto",
  will: "Vontade",
  perception: "Percepção",
};

type Stat = Readonly<{ label: string; value: string }>;

function requirementStat(requirement: MerchantWeaponDetails["requirement"]): Stat | null {
  if (!requirement || requirement.minimum <= 0) return null;
  return { label: "Requisito", value: `${attributeLabels[requirement.attribute]} ${requirement.minimum}` };
}

function weaponStats(weapon: MerchantWeaponDetails): Stat[] {
  return [
    weapon.damage ? { label: "Dano", value: weapon.damage } : null,
    weapon.hands ? { label: "Empunhadura", value: handsLabels[weapon.hands] } : null,
    requirementStat(weapon.requirement),
  ].filter((stat): stat is Stat => stat !== null);
}

function armorStats(armor: MerchantArmorDetails): Stat[] {
  return [
    armor.shield ? { label: "Tipo", value: "Escudo" } : null,
    armor.defense ? { label: "Defesa", value: armor.defense } : null,
    armor.fixed ? { label: "Defesa fixa", value: armor.fixed } : null,
    armor.agility ? { label: "Agilidade", value: armor.agility } : null,
    requirementStat(armor.requirement),
  ].filter((stat): stat is Stat => stat !== null);
}

/** Selos de raridade e tipo de consumível; o texto carrega o significado. */
export function ItemBadges({ item }: Readonly<{ item: MerchantItemProjection }>) {
  if (!item.availability && !item.consumableType) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {item.availability ? (
        <Badge tone={availabilityTone[item.availability]}>
          <span className="sr-only">Raridade: </span>
          {MERCHANT_AVAILABILITY_LABELS[item.availability]}
        </Badge>
      ) : null}
      {item.consumableType ? (
        <Badge>
          <span className="sr-only">Consumível: </span>
          {MERCHANT_CONSUMABLE_LABELS[item.consumableType]}
        </Badge>
      ) : null}
    </div>
  );
}

/** Ficha curta do item: números de arma ou armadura e as propriedades. */
export function ItemStats({ item }: Readonly<{ item: MerchantItemProjection }>) {
  const stats = [
    ...(item.weapon ? weaponStats(item.weapon) : []),
    ...(item.armor ? armorStats(item.armor) : []),
  ];
  if (stats.length === 0 && !item.properties) return null;
  return (
    <dl className="flex flex-wrap gap-2 text-sm">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-md border border-line-soft bg-surface-2 px-2.5 py-1">
          <dt className="inline text-fg-subtle">{stat.label}: </dt>
          <dd className="inline font-semibold">{stat.value}</dd>
        </div>
      ))}
      {item.properties ? (
        <div className="basis-full">
          <dt className="inline text-fg-subtle">Propriedades: </dt>
          <dd className="inline text-fg-muted">{item.properties}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Descrição sempre visível; textos longos abrem por completo sob demanda. */
export function ItemDescription({ description }: Readonly<{ description: string | null }>) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  if (!description) {
    return <p className="text-sm text-fg-subtle italic">Descrição não informada</p>;
  }
  const long = description.length > 220;
  return (
    <div className="space-y-1">
      <p
        id={id}
        className={cn(
          "max-w-[68ch] text-sm whitespace-pre-line text-fg-muted text-pretty",
          long && !expanded && "line-clamp-3",
        )}
      >
        {description}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((current) => !current)}
          className="min-h-9 rounded-md text-sm font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          {expanded ? "Mostrar menos" : "Ler descrição completa"}
        </button>
      ) : null}
    </div>
  );
}

/** Ícone do item (miniatura enviada pelo módulo) ou a inicial do nome. */
export function ItemImage({ item, size = "md" }: Readonly<{ item: MerchantItemProjection; size?: "sm" | "md" }>) {
  const box = size === "sm" ? "size-12" : "size-16";
  if (!item.imageUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-md border border-line-soft bg-surface-2 font-display text-2xl text-fg-subtle",
          box,
        )}
      >
        {item.name.slice(0, 1)}
      </span>
    );
  }
  return (
    // A imagem é uma miniatura em data URL ou um endereço HTTPS já validado pelo contrato.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cn("shrink-0 rounded-md border border-line-soft bg-surface-2 object-cover", box)}
      src={item.imageUrl}
      alt=""
      width={size === "sm" ? 48 : 64}
      height={size === "sm" ? 48 : 64}
      loading="lazy"
      decoding="async"
    />
  );
}
