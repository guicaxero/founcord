import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";

/**
 * Criador de criaturas. A criatura é descrita num formato de domínio, com os
 * campos do sistema Demon Lord conferidos no compêndio; o módulo do Foundry é
 * quem traduz esse formato para o ator. Nada aqui carrega código ou HTML.
 */

export const CREATURE_DIFFICULTIES = [1, 5, 10, 25, 50, 100, 250, 500] as const;
export const CREATURE_ATTRIBUTES = ["strength", "agility", "intellect", "will", "perception"] as const;

export const CreatureDifficultySchema = z.union([
  z.literal(1),
  z.literal(5),
  z.literal(10),
  z.literal(25),
  z.literal(50),
  z.literal(100),
  z.literal(250),
  z.literal(500),
]);

/**
 * Imagem do ator: caminho relativo do Foundry (`icons/...`, `tokenizer/...`,
 * `worlds/...`), com query de cache opcional, ou HTTPS. Sem `..` nem esquemas.
 */
export const CreatureImagePathSchema = z
  .string()
  .trim()
  .max(512)
  .refine(
    (value) =>
      /^https:\/\/[^\s<>"']+$/u.test(value) ||
      (/^(?![a-z][a-z0-9+.-]*:)(?!\/)[^\s<>"'\\]+$/iu.test(value.replaceAll("%20", "")) && !value.includes("..")),
    { message: "Use um caminho do Foundry (ex.: icons/svg/mystery-man.svg) ou um endereço HTTPS." },
  );

const text = (max: number) => z.string().trim().max(max);
const plainText = (max: number) => z.string().max(max).default("");

const itemBase = {
  /** Identificador local do item, estável entre edições. */
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  description: plainText(8_000),
  image: CreatureImagePathSchema.nullable().default(null),
};

export const CreatureAttackSchema = z
  .object({
    ...itemBase,
    kind: z.literal("attack"),
    /** Modificador do ataque, como no bloco de estatísticas (`+7`). */
    bonus: text(10).default(""),
    against: z.enum(["defense", ...CREATURE_ATTRIBUTES]).default("defense"),
    boons: z.number().int().min(-10).max(10).default(0),
    damage: text(60).default(""),
    properties: text(200).default(""),
  })
  .strict();

const textItem = <K extends "trait" | "special_action" | "end_of_round">(kind: K) =>
  z.object({ ...itemBase, kind: z.literal(kind) }).strict();

export const CreatureSpellSchema = z
  .object({
    ...itemBase,
    kind: z.literal("spell"),
    tradition: text(60).default(""),
    rank: z.number().int().min(0).max(10).default(0),
    attribute: z.enum(["intellect", "will"]).default("intellect"),
    spellType: z.enum(["attack", "utility"]).default("utility"),
    target: text(200).default(""),
    area: text(200).default(""),
    duration: text(120).default(""),
  })
  .strict();

export const CreatureItemSchema = z.discriminatedUnion("kind", [
  CreatureAttackSchema,
  textItem("trait"),
  textItem("special_action"),
  textItem("end_of_round"),
  CreatureSpellSchema,
]);

export const CreatureAttributesSchema = z
  .object(
    Object.fromEntries(CREATURE_ATTRIBUTES.map((key) => [key, z.number().int().min(0).max(30)])) as Record<
      (typeof CREATURE_ATTRIBUTES)[number],
      z.ZodNumber
    >,
  )
  .strict();

export const CreatureDraftSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    descriptor: text(120).default(""),
    description: plainText(8_000),
    difficulty: CreatureDifficultySchema,
    size: text(20).default("1"),
    image: CreatureImagePathSchema.nullable().default(null),
    attributes: CreatureAttributesSchema,
    defense: z.number().int().min(0).max(40),
    health: z.number().int().min(1).max(2_000),
    speed: z.number().int().min(0).max(100),
    power: z.number().int().min(0).max(10).default(0),
    insanity: z.number().int().min(0).max(100).default(0),
    corruption: z.number().int().min(0).max(100).default(0),
    perceptionSenses: text(200).default(""),
    speedTraits: text(200).default(""),
    armor: text(120).default(""),
    frightening: z.boolean().default(false),
    horrifying: z.boolean().default(false),
    items: z.array(CreatureItemSchema).max(60).default([]),
  })
  .strict();

export const CreatureStatusSchema = z.enum(["draft", "pending_delivery", "synced", "failed"]);

export const CreatureSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    draft: CreatureDraftSchema,
    basedOn: z.object({ entryId: EntityIdSchema, name: z.string() }).strict().nullable(),
    version: z.number().int().positive(),
    status: CreatureStatusSchema,
    /** Versão que está (ou foi pedida) no Foundry; menor que `version` = há alterações não enviadas. */
    sentVersion: z.number().int().nonnegative(),
    worldId: EntityIdSchema.nullable(),
    foundryActorId: z.string().max(128).nullable(),
    error: z.string().max(1_000).nullable(),
    createdByName: z.string().min(1).max(100),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    sentAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const CreatureListResponseSchema = z.object({ data: z.array(CreatureSchema) }).strict();

export const CreatureCreateInputSchema = z
  .object({
    draft: CreatureDraftSchema,
    basedOnEntryId: EntityIdSchema.nullable().default(null),
  })
  .strict();

export const CreatureUpdateInputSchema = z
  .object({ draft: CreatureDraftSchema, version: z.number().int().positive() })
  .strict();

export const CreatureSendInputSchema = z.object({ worldId: EntityIdSchema }).strict();

export const CreatureTargetSchema = z
  .object({
    worldId: EntityIdSchema,
    worldTitle: z.string().trim().min(1).max(120),
    status: z.enum(["online", "offline", "revoked"]),
    moduleVersion: z.string().max(40),
    blockedReason: z.enum(["module_outdated", "revoked"]).nullable(),
  })
  .strict();

export const CreatureTargetListResponseSchema = z.object({ data: z.array(CreatureTargetSchema) }).strict();

export const CreatureDeliveryCallbackSchema = z
  .object({
    creatureId: EntityIdSchema,
    version: z.number().int().positive(),
    commandId: EntityIdSchema,
    outcome: z.enum(["succeeded", "failed"]),
    actorId: z.string().max(128).nullable(),
    error: z.string().trim().min(1).max(1_000).nullable(),
    deliveredAt: IsoDateTimeSchema,
  })
  .strict();

/** Versão mínima do módulo que entende `creature.upsert`. */
export function moduleSupportsCreatures(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return major > 0 || minor >= 10;
}

/* ------------------------------------------------------------------ */
/* Compêndio importado pelo mestre                                      */
/* ------------------------------------------------------------------ */

export const CompendiumKindSchema = z.enum(["creature", "spell"]);

export const CompendiumEntrySummarySchema = z
  .object({
    id: EntityIdSchema,
    kind: CompendiumKindSchema,
    name: z.string(),
    /** Descritor da criatura ou tradição da magia. */
    category: z.string(),
    difficulty: z.number().int().nullable(),
    rank: z.number().int().nullable(),
    defense: z.number().int().nullable(),
    health: z.number().int().nullable(),
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const CompendiumListResponseSchema = z
  .object({ data: z.array(CompendiumEntrySummarySchema) })
  .strict();

export const CompendiumCreatureEntrySchema = CompendiumEntrySummarySchema.extend({
  kind: z.literal("creature"),
  data: CreatureDraftSchema,
}).strict();

export const CompendiumSpellEntrySchema = CompendiumEntrySummarySchema.extend({
  kind: z.literal("spell"),
  data: CreatureSpellSchema,
}).strict();

export const CompendiumEntrySchema = z.discriminatedUnion("kind", [
  CompendiumCreatureEntrySchema,
  CompendiumSpellEntrySchema,
]);

export const CompendiumImportInputSchema = z
  .object({
    kind: CompendiumKindSchema,
    files: z
      .array(z.object({ fileName: z.string().min(1).max(200), content: z.unknown() }).strict())
      .min(1)
      .max(30),
  })
  .strict();

export const CompendiumImportResponseSchema = z
  .object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.array(z.object({ fileName: z.string(), reason: z.string() }).strict()),
  })
  .strict();

export type CreatureDifficulty = (typeof CREATURE_DIFFICULTIES)[number];
export type CreatureAttribute = (typeof CREATURE_ATTRIBUTES)[number];
export type CreatureItem = z.infer<typeof CreatureItemSchema>;
export type CreatureAttack = z.infer<typeof CreatureAttackSchema>;
export type CreatureSpell = z.infer<typeof CreatureSpellSchema>;
export type CreatureDraft = z.infer<typeof CreatureDraftSchema>;
export type CreatureDraftInput = z.input<typeof CreatureDraftSchema>;
export type CreatureStatus = z.infer<typeof CreatureStatusSchema>;
export type Creature = z.infer<typeof CreatureSchema>;
export type CreatureListResponse = z.infer<typeof CreatureListResponseSchema>;
export type CreatureCreateInput = z.infer<typeof CreatureCreateInputSchema>;
export type CreatureUpdateInput = z.infer<typeof CreatureUpdateInputSchema>;
export type CreatureSendInput = z.infer<typeof CreatureSendInputSchema>;
export type CreatureTarget = z.infer<typeof CreatureTargetSchema>;
export type CreatureTargetListResponse = z.infer<typeof CreatureTargetListResponseSchema>;
export type CreatureDeliveryCallback =z.infer<typeof CreatureDeliveryCallbackSchema>;
export type CompendiumKind = z.infer<typeof CompendiumKindSchema>;
export type CompendiumEntrySummary = z.infer<typeof CompendiumEntrySummarySchema>;
export type CompendiumListResponse = z.infer<typeof CompendiumListResponseSchema>;
export type CompendiumEntry = z.infer<typeof CompendiumEntrySchema>;
export type CompendiumImportInput = z.infer<typeof CompendiumImportInputSchema>;
export type CompendiumImportResponse = z.infer<typeof CompendiumImportResponseSchema>;
