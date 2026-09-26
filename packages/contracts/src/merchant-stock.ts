import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";
import { MerchantItemAvailabilitySchema } from "./merchant";

/**
 * Catálogo do Lojista e sorteio de estoque.
 *
 * O portal guarda a lista de itens que o Lojista pode vender. O mestre escolhe
 * a disponibilidade máxima, as categorias e a quantidade; o backend sorteia e,
 * quando o mestre confirma, o módulo do Foundry cria os itens no ator do
 * Lojista. O Foundry continua sendo a fonte de verdade do estoque.
 */

/** Ordem das disponibilidades: o teto inclui todas as anteriores. */
export const MERCHANT_AVAILABILITY_ORDER = ["common", "uncommon", "rare", "exotic"] as const;

export function availabilityRank(value: z.infer<typeof MerchantItemAvailabilitySchema>): number {
  return MERCHANT_AVAILABILITY_ORDER.indexOf(value);
}

/** Tipo do item no Foundry: arma, armadura ou item comum. */
export const MerchantCatalogKindSchema = z.enum(["weapon", "armor", "item"]);

const shortText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);

/** Ícone de um caminho do próprio Foundry (sistema, núcleo ou módulo). */
const foundryIconPath = z
  .string()
  .trim()
  .max(512)
  .regex(/^(systems|icons|modules)\/[A-Za-z0-9 %._/-]+\.(webp|png|jpe?g|svg)$/u, {
    message: "Use um caminho de ícone do Foundry, como systems/demonlord/assets/icons/...",
  })
  .nullable()
  .default(null);

export const MerchantCatalogRequirementSchema = z
  .object({
    attribute: z.enum(["strength", "agility", "intellect", "will", "perception"]),
    minimum: z.number().int().min(1).max(99),
  })
  .strict();

/** Campos editáveis de um item do catálogo. */
export const MerchantCatalogItemInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    category: z.string().trim().min(2).max(80),
    kind: MerchantCatalogKindSchema,
    availability: MerchantItemAvailabilitySchema,
    /** Preço como no livro (`5 cc`, `1 co`, `1 xp+`); sem preço, fica fora do sorteio. */
    price: shortText(64),
    damage: shortText(40),
    hands: z.enum(["one", "two", "off"]).nullable().default(null),
    /** Bônus de Agilidade da armadura (ex.: `1`). */
    agility: shortText(40),
    /** Defesa fixa da armadura (ex.: `13`). */
    fixed: shortText(40),
    requirement: MerchantCatalogRequirementSchema.nullable().default(null),
    properties: shortText(500),
    description: shortText(4_000),
    icon: foundryIconPath,
    /** Origem do item. Hoje só o Lojista; os NPCs artesãos entram aqui depois. */
    source: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/u).default("lojista"),
  })
  .strict();

export const MerchantCatalogItemSchema = MerchantCatalogItemInputSchema.extend({
  id: EntityIdSchema,
  campaignId: EntityIdSchema,
  active: z.boolean(),
  version: z.number().int().positive(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict();

export const MerchantCatalogItemUpdateSchema = MerchantCatalogItemInputSchema.partial()
  .extend({
    active: z.boolean().optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const MerchantCatalogListResponseSchema = z
  .object({ data: z.array(MerchantCatalogItemSchema) })
  .strict();

export const MerchantCatalogImportResponseSchema = z
  .object({ created: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() })
  .strict();

/** Critérios do sorteio, como na planilha. */
export const MerchantStockCriteriaSchema = z
  .object({
    maxAvailability: MerchantItemAvailabilitySchema,
    /** Categorias escolhidas; vazio significa todas. */
    categories: z.array(z.string().trim().min(2).max(80)).max(50).default([]),
    quantity: z.number().int().min(1).max(100),
    allowRepeat: z.boolean().default(false),
  })
  .strict();

/** Item sorteado, com uma cópia dos dados no momento do sorteio. */
export const MerchantStockEntrySchema = MerchantCatalogItemInputSchema.extend({
  catalogItemId: EntityIdSchema,
  quantity: z.number().int().min(1).max(100),
}).strict();

export const MerchantStockDrawStatusSchema = z.enum([
  "preview",
  "pending_delivery",
  "applied",
  "failed",
  "discarded",
]);

export const MerchantStockDrawSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    criteria: MerchantStockCriteriaSchema,
    eligibleCount: z.number().int().nonnegative(),
    entries: z.array(MerchantStockEntrySchema).max(100),
    status: MerchantStockDrawStatusSchema,
    worldId: EntityIdSchema.nullable(),
    error: z.string().max(1_000).nullable(),
    createdByName: z.string().trim().min(1).max(100),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    appliedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const MerchantStockDrawListResponseSchema = z
  .object({ data: z.array(MerchantStockDrawSchema) })
  .strict();

export const MerchantStockApplyInputSchema = z.object({ worldId: EntityIdSchema }).strict();

/** Mundo que pode receber o estoque, com o motivo quando não pode. */
export const MerchantStockTargetSchema = z
  .object({
    worldId: EntityIdSchema,
    worldTitle: z.string().trim().min(1).max(120),
    status: z.enum(["online", "offline", "revoked"]),
    moduleVersion: z.string().max(40),
    merchantName: z.string().trim().min(1).max(160).nullable(),
    blockedReason: z.enum(["module_outdated", "merchant_missing", "revoked"]).nullable(),
  })
  .strict();

export const MerchantStockTargetListResponseSchema = z
  .object({ data: z.array(MerchantStockTargetSchema) })
  .strict();

export const MerchantStockDeliveryCallbackSchema = z
  .object({
    drawId: EntityIdSchema,
    commandId: EntityIdSchema,
    outcome: z.enum(["succeeded", "failed"]),
    error: z.string().trim().min(1).max(1_000).nullable(),
    deliveredAt: IsoDateTimeSchema,
  })
  .strict();

/** Versão mínima do módulo que entende `merchant.stock.replace`. */
export const MERCHANT_STOCK_MIN_MODULE_VERSION = "0.8.0";

export function moduleSupportsStockReplace(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return major > 0 || minor >= 8;
}

export type MerchantStockCriteria = z.infer<typeof MerchantStockCriteriaSchema>;
export type MerchantCatalogKind = z.infer<typeof MerchantCatalogKindSchema>;
export type MerchantCatalogItemInput = z.input<typeof MerchantCatalogItemInputSchema>;
export type MerchantCatalogItem = z.infer<typeof MerchantCatalogItemSchema>;
export type MerchantCatalogItemUpdate = z.infer<typeof MerchantCatalogItemUpdateSchema>;
export type MerchantCatalogListResponse = z.infer<typeof MerchantCatalogListResponseSchema>;
export type MerchantCatalogImportResponse = z.infer<typeof MerchantCatalogImportResponseSchema>;
export type MerchantStockEntry = z.infer<typeof MerchantStockEntrySchema>;
export type MerchantStockDrawStatus = z.infer<typeof MerchantStockDrawStatusSchema>;
export type MerchantStockDraw = z.infer<typeof MerchantStockDrawSchema>;
export type MerchantStockDrawListResponse = z.infer<typeof MerchantStockDrawListResponseSchema>;
export type MerchantStockApplyInput = z.infer<typeof MerchantStockApplyInputSchema>;
export type MerchantStockTarget = z.infer<typeof MerchantStockTargetSchema>;
export type MerchantStockTargetListResponse = z.infer<typeof MerchantStockTargetListResponseSchema>;
export type MerchantStockDeliveryCallback = z.infer<typeof MerchantStockDeliveryCallbackSchema>;

/** Gerador de números em [0, 1); injetável para testes determinísticos. */
export type RandomSource = () => number;

export function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! / 2 ** 32;
}

/** Item apto a entrar no sorteio: ativo, com preço, dentro do teto e das categorias. */
export function isEligibleForDraw(item: MerchantCatalogItem, criteria: MerchantStockCriteria): boolean {
  return (
    item.active &&
    item.price !== null &&
    availabilityRank(item.availability) <= availabilityRank(criteria.maxAvailability) &&
    (criteria.categories.length === 0 || criteria.categories.includes(item.category))
  );
}

/**
 * Sorteia o estoque. Todo item elegível tem a mesma chance, como na planilha.
 * Sem repetição, cada item sai no máximo uma vez (e a quantidade pode ficar
 * menor que a pedida). Com repetição, um item sorteado de novo soma quantidade.
 */
export function drawMerchantStock(
  items: readonly MerchantCatalogItem[],
  criteria: MerchantStockCriteria,
  random: RandomSource = cryptoRandom,
): Readonly<{ eligibleCount: number; entries: MerchantStockEntry[] }> {
  const eligible = items.filter((item) => isEligibleForDraw(item, criteria));
  if (eligible.length === 0) return { eligibleCount: 0, entries: [] };

  const counts = new Map<string, number>();
  if (criteria.allowRepeat) {
    for (let draw = 0; draw < criteria.quantity; draw += 1) {
      const item = eligible[Math.floor(random() * eligible.length)]!;
      counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    }
  } else {
    const pool = [...eligible];
    // Fisher–Yates parcial: só embaralha o que vai ser usado.
    const take = Math.min(criteria.quantity, pool.length);
    for (let index = 0; index < take; index += 1) {
      const swap = index + Math.floor(random() * (pool.length - index));
      [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
      counts.set(pool[index]!.id, 1);
    }
  }

  const byId = new Map(eligible.map((item) => [item.id, item]));
  const entries = [...counts.entries()].map(([id, quantity]) => {
    const item = byId.get(id)!;
    return MerchantStockEntrySchema.parse({
      catalogItemId: item.id,
      quantity,
      name: item.name,
      category: item.category,
      kind: item.kind,
      availability: item.availability,
      price: item.price,
      damage: item.damage,
      hands: item.hands,
      agility: item.agility,
      fixed: item.fixed,
      requirement: item.requirement,
      properties: item.properties,
      description: item.description,
      icon: item.icon,
      source: item.source,
    });
  });
  entries.sort(
    (left, right) =>
      left.category.localeCompare(right.category, "pt-BR") ||
      availabilityRank(left.availability) - availabilityRank(right.availability) ||
      left.name.localeCompare(right.name, "pt-BR"),
  );
  return { eligibleCount: eligible.length, entries };
}
