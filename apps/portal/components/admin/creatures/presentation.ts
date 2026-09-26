import type {
  CreatureAttribute,
  CreatureItem,
  CreatureStatus,
  CreatureTarget,
} from "@ordem/contracts";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const attributeLabels: Readonly<Record<CreatureAttribute, string>> = {
  strength: "Força",
  agility: "Agilidade",
  intellect: "Intelecto",
  will: "Vontade",
  perception: "Percepção",
};

export const attributeShort: Readonly<Record<CreatureAttribute, string>> = {
  strength: "For",
  agility: "Agi",
  intellect: "Int",
  will: "Von",
  perception: "Per",
};

export const itemKindContent: Readonly<
  Record<CreatureItem["kind"], Readonly<{ label: string; plural: string; hint: string }>>
> = {
  attack: {
    label: "Ataque",
    plural: "Ataques",
    hint: "Arma natural ou empunhada, com modificador, resistência e dano.",
  },
  trait: {
    label: "Traço",
    plural: "Traços",
    hint: "Características passivas, como imunidades ou sentidos especiais.",
  },
  special_action: {
    label: "Ação especial",
    plural: "Ações especiais",
    hint: "Ações fora do ataque comum, inclusive reações.",
  },
  end_of_round: {
    label: "Fim da rodada",
    plural: "Fim da rodada",
    hint: "Efeitos que acontecem no fim de cada rodada.",
  },
  spell: {
    label: "Magia",
    plural: "Magias",
    hint: "Magias que a criatura conhece. Podem vir do grimório importado.",
  },
};

export const itemKindOrder: readonly CreatureItem["kind"][] = [
  "attack",
  "trait",
  "special_action",
  "end_of_round",
  "spell",
];

export const statusContent: Readonly<Record<CreatureStatus, Readonly<{ label: string; tone: Tone }>>> = {
  draft: { label: "Só no portal", tone: "neutral" },
  pending_delivery: { label: "Aguardando o Foundry", tone: "info" },
  synced: { label: "No Foundry", tone: "success" },
  failed: { label: "Falhou no Foundry", tone: "danger" },
};

export const blockedCopy: Readonly<Record<NonNullable<CreatureTarget["blockedReason"]>, string>> = {
  module_outdated: "o módulo precisa ser atualizado para a versão 0.10.0 ou mais nova",
  revoked: "o mundo foi desconectado da campanha",
};

export const againstLabel = (value: string): string =>
  value === "defense" ? "Defesa" : attributeLabels[value as CreatureAttribute] ?? value;

export const spellAttributeLabel = (value: "intellect" | "will") => attributeLabels[value];

/** Situação da criatura considerando alterações salvas depois do último envio. */
export function creatureSituation(
  creature: Readonly<{ status: CreatureStatus; version: number; sentVersion: number }>,
): Readonly<{ label: string; tone: Tone; outdated: boolean }> {
  const outdated = creature.sentVersion > 0 && creature.version > creature.sentVersion;
  const base = statusContent[creature.status];
  return { ...base, outdated };
}

export function difficultyLabel(value: number | null): string {
  return value === null ? "—" : `Dificuldade ${value}`;
}
