import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";

/**
 * Vida na Sede: entre uma missão e outra, cada Corvo escolhe atividades na
 * Sede da Ordem. O nível da Sede define quantas atividades cabem em cada
 * período e quais estão disponíveis; o Guardião resolve cada uma.
 *
 * Um período termina quando o Corvo se inscreve numa missão: o que ele
 * declarou depois disso já conta para o intervalo seguinte.
 */

export const SEDE_MAX_LEVEL = 4;

export const SedeLevelSchema = z.number().int().min(1).max(SEDE_MAX_LEVEL);

/**
 * O que o jogador informa ao escolher a atividade:
 * - `none`: nada;
 * - `note`: observação opcional (ex.: o que gostaria de comer);
 * - `question`: pergunta obrigatória (ex.: Pesquisa com a Escriba).
 */
export const SedeActivityInputModeSchema = z.enum(["none", "note", "question"]);

/** Rolagem feita pelo portal no momento da escolha, como `2d20`. */
export const SedeRollFormulaSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d?d(4|6|8|10|12|20|100)$/u, { message: "Use o formato NdM, como 2d20." });

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const SedeActivityInputSchema = z
  .object({
    npc: text(2, 60),
    name: text(2, 80),
    description: text(1, 1_000),
    effect: text(1, 1_000),
    minLevel: SedeLevelSchema,
    inputMode: SedeActivityInputModeSchema.default("none"),
    roll: SedeRollFormulaSchema.nullable().default(null),
    active: z.boolean().default(true),
    sort: z.number().int().min(0).max(1_000).default(0),
  })
  .strict();

export const SedeActivityUpdateSchema = SedeActivityInputSchema.extend({
  version: z.number().int().positive(),
}).strict();

export const SedeActivitySchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    npc: z.string(),
    name: z.string(),
    description: z.string(),
    effect: z.string(),
    minLevel: SedeLevelSchema,
    inputMode: SedeActivityInputModeSchema,
    roll: z.string().nullable(),
    active: z.boolean(),
    sort: z.number().int(),
    version: z.number().int().positive(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const SedeRollSchema = z
  .object({
    formula: z.string(),
    dice: z.array(z.number().int().positive()).max(99),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const SedeDeclarationStatusSchema = z.enum(["declared", "resolved", "cancelled"]);

export const SedeDeclarationSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    playerName: z.string(),
    actorName: z.string(),
    activity: z
      .object({ id: EntityIdSchema, npc: z.string(), name: z.string(), effect: z.string() })
      .strict(),
    note: z.string().nullable(),
    roll: SedeRollSchema.nullable(),
    status: SedeDeclarationStatusSchema,
    result: z.string().nullable(),
    resolvedByName: z.string().nullable(),
    resolvedAt: IsoDateTimeSchema.nullable(),
    /** Início do período em que a atividade foi declarada (a inscrição anterior), ou `null` no primeiro período. */
    periodStartedAt: IsoDateTimeSchema.nullable(),
    /** O Corvo tem um tópico no Registro do Corvo, onde o bot publica a atividade. */
    registroLinked: z.boolean(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

/** O que o jogador vê na aba Vida na Sede. */
export const SedeStateResponseSchema = z
  .object({
    campaignId: EntityIdSchema,
    level: SedeLevelSchema,
    /** Personagem vinculado; sem ele, o jogador não declara atividades. */
    actorName: z.string().nullable(),
    period: z
      .object({
        startedAt: IsoDateTimeSchema.nullable(),
        allowance: z.number().int().nonnegative(),
        used: z.number().int().nonnegative(),
        remaining: z.number().int().nonnegative(),
      })
      .strict(),
    activities: z.array(SedeActivitySchema.extend({ chosenThisPeriod: z.boolean() }).strict()),
    current: z.array(SedeDeclarationSchema),
    history: z.array(SedeDeclarationSchema),
  })
  .strict();

export const SedeDeclareInputSchema = z
  .object({
    activityId: EntityIdSchema,
    note: z.string().trim().max(1_000).nullable().default(null),
  })
  .strict();

export const SedeResolveInputSchema = z.object({ result: text(1, 2_000) }).strict();

export const SedeSettingsInputSchema = z.object({ level: SedeLevelSchema }).strict();

/** O que o Guardião vê no painel. */
export const SedeManageResponseSchema = z
  .object({
    level: SedeLevelSchema,
    activities: z.array(SedeActivitySchema),
    pending: z.array(SedeDeclarationSchema),
    resolved: z.array(SedeDeclarationSchema),
  })
  .strict();

export const SedeImportResponseSchema = z
  .object({ created: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() })
  .strict();

/** Rola `NdM` com a fonte de aleatoriedade dada (injetável nos testes). */
export function rollSede(formula: string, random: () => number): z.infer<typeof SedeRollSchema> {
  const [count, sides] = SedeRollFormulaSchema.parse(formula).split("d").map((part) => Number.parseInt(part, 10)) as [
    number,
    number,
  ];
  const dice = Array.from({ length: count }, () => Math.floor(random() * sides) + 1);
  return { formula, dice, total: dice.reduce((sum, value) => sum + value, 0) };
}

export type SedeActivityInputMode = z.infer<typeof SedeActivityInputModeSchema>;
export type SedeActivityInput = z.infer<typeof SedeActivityInputSchema>;
export type SedeActivityUpdate = z.infer<typeof SedeActivityUpdateSchema>;
export type SedeActivity = z.infer<typeof SedeActivitySchema>;
export type SedeRoll = z.infer<typeof SedeRollSchema>;
export type SedeDeclarationStatus = z.infer<typeof SedeDeclarationStatusSchema>;
export type SedeDeclaration = z.infer<typeof SedeDeclarationSchema>;
export type SedeStateResponse = z.infer<typeof SedeStateResponseSchema>;
export type SedeDeclareInput = z.infer<typeof SedeDeclareInputSchema>;
export type SedeResolveInput = z.infer<typeof SedeResolveInputSchema>;
export type SedeSettingsInput = z.infer<typeof SedeSettingsInputSchema>;
export type SedeManageResponse = z.infer<typeof SedeManageResponseSchema>;
export type SedeImportResponse = z.infer<typeof SedeImportResponseSchema>;
