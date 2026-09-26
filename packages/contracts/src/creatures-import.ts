import {
  CREATURE_ATTRIBUTES,
  CREATURE_DIFFICULTIES,
  CreatureDraftSchema,
  CreatureImagePathSchema,
  CreatureSpellSchema,
  type CompendiumEntrySummary,
  type CreatureDifficulty,
  type CreatureDraft,
  type CreatureItem,
  type CreatureSpell,
} from "./creatures";

/**
 * Conversão dos exports do Foundry (pasta `compendium/`) para o formato do
 * criador. Recebe o JSON que o mestre importa no painel; nenhum conteúdo do
 * compêndio vive no código.
 */

type Json = Record<string, unknown>;

const record = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const int = (value: unknown, fallback = 0): number => {
  const number = Number.parseInt(str(value), 10);
  return Number.isFinite(number) ? number : fallback;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** HTML do Foundry para texto simples, preservando parágrafos e listas. */
export function htmlToPlainText(html: unknown): string {
  return str(html)
    .replace(/<\s*br\s*\/?>/giu, "\n")
    .replace(/<\s*hr\s*\/?>/giu, "\n")
    .replace(/<\s*li[^>]*>/giu, "• ")
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|section|blockquote)\s*>/giu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/giu, (entity, code: string) => {
      const key = code.toLowerCase();
      if (ENTITIES[key]) return ENTITIES[key]!;
      if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
      if (key.startsWith("#")) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
      return entity;
    })
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** Dificuldade válida mais próxima (o livro usa 1, 5, 10, 25, 50, 100, 250, 500). */
export function nearestDifficulty(value: number): CreatureDifficulty {
  return CREATURE_DIFFICULTIES.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
  );
}

function imagePath(value: unknown): string | null {
  const parsed = CreatureImagePathSchema.safeParse(str(value));
  return parsed.success && parsed.data ? parsed.data : null;
}

function spellFields(system: Json): Omit<CreatureSpell, "id" | "name" | "description" | "image" | "kind"> {
  const attribute = str(system.attribute).toLowerCase();
  const spellType = str(system.spelltype).toLowerCase();
  return {
    tradition: str(system.tradition).trim().slice(0, 60),
    rank: clamp(int(system.rank), 0, 10),
    attribute: attribute === "will" ? "will" : "intellect",
    spellType: spellType === "attack" ? "attack" : "utility",
    target: str(system.target).trim().slice(0, 200),
    area: str(system.area).trim().slice(0, 200),
    duration: str(system.duration).trim().slice(0, 120),
  };
}

function itemFromExport(raw: unknown, index: number): CreatureItem | null {
  const item = record(raw);
  const system = record(item.system);
  const base = {
    id: str(item._id).slice(0, 64) || `item-${index}`,
    name: str(item.name).trim().slice(0, 120) || "Sem nome",
    description: htmlToPlainText(system.description).slice(0, 8_000),
    image: imagePath(item.img),
  };
  switch (item.type) {
    case "weapon": {
      const action = record(system.action);
      const against = str(action.against).toLowerCase();
      return {
        ...base,
        kind: "attack",
        bonus: str(action.attack).trim().slice(0, 10),
        against: (CREATURE_ATTRIBUTES as readonly string[]).includes(against)
          ? (against as (typeof CREATURE_ATTRIBUTES)[number])
          : "defense",
        boons: clamp(int(action.boonsbanes), -10, 10),
        damage: str(action.damage).trim().slice(0, 60),
        properties: str(system.properties).trim().slice(0, 200),
      };
    }
    case "talent":
      return { ...base, kind: "trait" };
    case "specialaction":
      return { ...base, kind: "special_action" };
    case "endoftheround":
      return { ...base, kind: "end_of_round" };
    case "spell":
      return { ...base, kind: "spell", ...spellFields(system) };
    default:
      return null;
  }
}

/** Criatura exportada do Foundry (tipo `creature`) no formato do criador. */
export function creatureFromFoundryExport(raw: unknown): CreatureDraft {
  const actor = record(raw);
  if (actor.type !== "creature") throw new Error("O arquivo não é uma criatura do Foundry.");
  const system = record(actor.system);
  const attributes = record(system.attributes);
  const characteristics = record(system.characteristics);
  const health = record(characteristics.health);
  const descriptor = str(system.descriptor).trim();
  // Alguns exports usam o descritor como nota do mestre; o texto longo vai para a descrição.
  const longDescriptor = descriptor.length > 120;
  const description = [longDescriptor ? `Nota: ${descriptor}` : "", htmlToPlainText(system.description)]
    .filter(Boolean)
    .join("\n\n");

  return CreatureDraftSchema.parse({
    name: str(actor.name).trim().slice(0, 120) || "Criatura sem nome",
    descriptor: longDescriptor ? "" : descriptor,
    description: description.slice(0, 8_000),
    difficulty: nearestDifficulty(int(system.difficulty, 1)),
    size: str(characteristics.size).trim().slice(0, 20) || "1",
    image: imagePath(actor.img),
    attributes: Object.fromEntries(
      CREATURE_ATTRIBUTES.map((key) => {
        const attribute = record(attributes[key]);
        return [key, clamp(int(attribute.value ?? attribute.base, 10), 0, 30)];
      }),
    ),
    defense: clamp(int(characteristics.defense, 10), 0, 40),
    health: clamp(int(health.max, 1), 1, 2_000),
    speed: clamp(int(characteristics.speed, 10), 0, 100),
    power: clamp(int(characteristics.power), 0, 10),
    insanity: clamp(int(record(characteristics.insanity).value), 0, 100),
    corruption: clamp(int(record(characteristics.corruption).value), 0, 100),
    perceptionSenses: str(system.perceptionsenses).trim().slice(0, 200),
    speedTraits: str(system.speedtraits).trim().slice(0, 200),
    armor: str(system.armor).trim().slice(0, 120),
    frightening: system.frightening === true,
    horrifying: system.horrifying === true,
    items: (Array.isArray(actor.items) ? actor.items : [])
      .map((item, index) => itemFromExport(item, index))
      .filter((item): item is CreatureItem => item !== null)
      .slice(0, 60),
  });
}

/** Magia exportada do Foundry (item `spell`) no formato do criador. */
export function spellFromFoundryExport(raw: unknown): CreatureSpell {
  const item = record(raw);
  if (item.type !== "spell") throw new Error("O arquivo não é uma magia do Foundry.");
  const parsed = itemFromExport(item, 0);
  return CreatureSpellSchema.parse(parsed);
}

/** Chave estável do documento no compêndio, para reimportar sem duplicar. */
export function compendiumSourceKey(raw: unknown, fileName: string): string {
  const id = str(record(raw)._id).trim();
  return (id || fileName.replace(/\.json$/iu, "")).slice(0, 128);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

/**
 * Ficha em branco para uma dificuldade. Defesa e Vida vêm da mediana das
 * criaturas importadas com a mesma dificuldade; sem bestiário, usa a base
 * humana do livro (atributos 10).
 */
export function blankCreatureDraft(
  difficulty: CreatureDifficulty,
  bestiary: readonly Pick<CompendiumEntrySummary, "kind" | "difficulty" | "defense" | "health">[] = [],
): CreatureDraft {
  const peers = bestiary.filter((entry) => entry.kind === "creature" && entry.difficulty === difficulty);
  return CreatureDraftSchema.parse({
    name: "Nova criatura",
    difficulty,
    attributes: { strength: 10, agility: 10, intellect: 10, will: 10, perception: 10 },
    defense: median(peers.map((entry) => entry.defense ?? 0).filter(Boolean)) ?? 10,
    health: median(peers.map((entry) => entry.health ?? 0).filter(Boolean)) ?? 10,
    speed: 10,
  });
}
