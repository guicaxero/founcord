import { z } from "zod";
import { IsoDateTimeSchema } from "./common";

/**
 * Ficha do personagem projetada pelo módulo do Foundry (0.11.0+). Só texto
 * simples e números: nenhum HTML, caminho de arquivo ou código sai do Foundry.
 * Os valores de atributos e características já vêm calculados pelo sistema.
 */

const itemId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);
const label = (max: number) => z.string().trim().min(1).max(max).nullable();
const text = (max: number) => z.string().max(max);
const count = z.number().int().min(0).max(100_000);

/** Valor e máximo de um recurso (usos de talento, conjurações). `null` = sem limite informado. */
const ResourceSchema = z
  .object({ value: count.nullable(), max: count.nullable() })
  .strict();

const itemBase = {
  id: itemId,
  name: z.string().trim().min(1).max(120),
  /** Descrição em texto simples, truncada pelo módulo. */
  description: text(1_500),
};

export const CharacterSheetInventoryItemSchema = z
  .object({
    ...itemBase,
    type: z.enum(["weapon", "armor", "item", "ammo", "relic"]),
    quantity: count,
    equipped: z.boolean(),
    price: label(64),
    availability: label(20),
    properties: label(500),
    damage: label(60),
    hands: label(20),
    /** Defesa da armadura em uma linha (`Defesa 15`, `Agilidade +2`). */
    defense: label(60),
    consumableType: label(40),
  })
  .strict();

export const CharacterSheetSpellSchema = z
  .object({
    ...itemBase,
    tradition: label(80),
    rank: z.number().int().min(0).max(20),
    spellType: z.enum(["attack", "utility"]).nullable(),
    attribute: label(20),
    castings: ResourceSchema,
    target: label(200),
    area: label(200),
    duration: label(120),
  })
  .strict();

export const CharacterSheetTalentSchema = z
  .object({
    ...itemBase,
    kind: z.enum(["talent", "feature", "specialaction"]),
    /** Grupo do talento no sistema (trilha, ancestralidade…). */
    group: label(120),
    uses: ResourceSchema,
  })
  .strict();

export const CharacterSheetLanguageSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    speak: z.boolean(),
    read: z.boolean(),
    write: z.boolean(),
  })
  .strict();

const attributeValue = z.number().int().min(0).max(100);

export const CharacterSheetSchema = z
  .object({
    attributes: z
      .object({
        strength: attributeValue,
        agility: attributeValue,
        intellect: attributeValue,
        will: attributeValue,
        perception: attributeValue,
      })
      .strict(),
    characteristics: z
      .object({
        defense: count,
        speed: count,
        power: count,
        size: label(20),
        fortune: count,
      })
      .strict(),
    appearance: z
      .object({
        age: label(60),
        sex: label(60),
        eyes: label(60),
        hair: label(60),
        height: label(60),
        weight: label(60),
        feature: label(200),
      })
      .strict(),
    religion: label(120),
    inventory: z.array(CharacterSheetInventoryItemSchema).max(200),
    spells: z.array(CharacterSheetSpellSchema).max(120),
    talents: z.array(CharacterSheetTalentSchema).max(200),
    roots: z
      .object({
        ancestry: z
          .object({ name: z.string().trim().min(1).max(120), description: text(3_000) })
          .strict()
          .nullable(),
        professions: z
          .array(z.object({ name: z.string().trim().min(1).max(120), description: text(1_500) }).strict())
          .max(20),
        languages: z.array(CharacterSheetLanguageSchema).max(40),
      })
      .strict(),
    /**
     * Descrição do personagem (`system.description`) em texto simples, e a
     * marca da versão atual no Foundry, usada para não sobrescrever edições.
     */
    notes: z
      .object({ text: text(8_000), revision: z.string().min(1).max(64) })
      .strict(),
  })
  .strict();

/** Anotações editadas no portal e o andamento da gravação no Foundry. */
export const CharacterNotesUpdateStatusSchema = z.enum(["pending_delivery", "applied", "conflict", "failed"]);

export const CharacterNotesUpdateSchema = z
  .object({
    id: z.string().uuid(),
    status: CharacterNotesUpdateStatusSchema,
    /** Texto enviado pelo próprio jogador. */
    text: z.string().max(8_000),
    error: z.string().max(1_000).nullable(),
    requestedAt: IsoDateTimeSchema,
    appliedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const CharacterNotesUpdateInputSchema = z
  .object({
    text: z.string().max(8_000),
    /** Versão da descrição que o jogador viu; o módulo recusa se mudou no Foundry. */
    revision: z.string().min(1).max(64),
  })
  .strict();

export const CharacterNotesDeliveryCallbackSchema = z
  .object({
    updateId: z.string().uuid(),
    commandId: z.string().uuid(),
    outcome: z.enum(["succeeded", "failed"]),
    /** O módulo não gravou porque a descrição mudou no Foundry. */
    conflict: z.boolean(),
    error: z.string().trim().min(1).max(1_000).nullable(),
    deliveredAt: IsoDateTimeSchema,
  })
  .strict();

/** Ficha do personagem vinculado, como o jogador vê no portal. */
export const PlayerCharacterSheetResponseSchema = z
  .object({
    campaignId: z.string().uuid(),
    actorName: z.string().trim().min(1).max(120),
    /** `null` enquanto o mundo usa um módulo anterior ao 0.11.0. */
    sheet: CharacterSheetSchema.nullable(),
    lastSyncedAt: IsoDateTimeSchema.nullable(),
    /** Última alteração de anotações pedida pelo jogador, se houver. */
    notesUpdate: CharacterNotesUpdateSchema.nullable(),
  })
  .strict();

/** Tamanho máximo da ficha serializada de um personagem, em caracteres. */
export const MAX_CHARACTER_SHEET_CHARS = 400_000;

export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;
export type CharacterSheetInventoryItem = z.infer<typeof CharacterSheetInventoryItemSchema>;
export type CharacterSheetSpell = z.infer<typeof CharacterSheetSpellSchema>;
export type CharacterSheetTalent = z.infer<typeof CharacterSheetTalentSchema>;
export type CharacterSheetLanguage = z.infer<typeof CharacterSheetLanguageSchema>;
export type CharacterNotesUpdate = z.infer<typeof CharacterNotesUpdateSchema>;
export type CharacterNotesUpdateInput = z.infer<typeof CharacterNotesUpdateInputSchema>;
export type CharacterNotesDeliveryCallback = z.infer<typeof CharacterNotesDeliveryCallbackSchema>;
export type PlayerCharacterSheetResponse = z.infer<typeof PlayerCharacterSheetResponseSchema>;
