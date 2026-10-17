import type { RavenAttributes, RavenStats, RavenStatus, RavenSummary } from "@ordem/contracts";

export const ravenStatusLabels: Readonly<Record<RavenStatus, string>> = {
  active: "Na ativa",
  retired: "Aposentado",
  dead: "Morto",
};

export const ravenStatusTone = {
  active: "success",
  retired: "neutral",
  dead: "danger",
} as const;

/** Mesmos nomes da ficha do jogador e do compêndio. */
export const attributeLabels: readonly Readonly<{ key: keyof RavenAttributes; label: string }>[] = [
  { key: "strength", label: "Força" },
  { key: "agility", label: "Agilidade" },
  { key: "intellect", label: "Intelecto" },
  { key: "will", label: "Vontade" },
  { key: "perception", label: "Percepção" },
];

export const statLabels: readonly Readonly<{ key: keyof RavenStats; label: string }>[] = [
  { key: "health", label: "Vida" },
  { key: "healingRate", label: "Taxa de cura" },
  { key: "defense", label: "Defesa" },
  { key: "speed", label: "Velocidade" },
  { key: "power", label: "Poder" },
  { key: "insanity", label: "Insanidade" },
  { key: "corruption", label: "Corrupção" },
];

/** Trilhas na ordem do jogo: novato, especialista, mestre. */
export function pathsLabel(paths: RavenSummary["paths"]): string | null {
  const list = [paths.novice, paths.expert, paths.master].filter((path): path is string => Boolean(path));
  return list.length > 0 ? list.join(" / ") : null;
}

/** "Fauno · Sacerdote · Nível 1", sem partes vazias. */
export function identityLine(raven: RavenSummary): string {
  return [raven.ancestry, pathsLabel(raven.paths), raven.level === null ? null : `Nível ${raven.level}`]
    .filter(Boolean)
    .join(" · ");
}

export function valueOrDash(value: number | string | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}
