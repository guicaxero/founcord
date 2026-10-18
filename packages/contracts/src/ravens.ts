import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common";
import { MissionNumberSchema, MissionOutcomeSchema } from "./missions";

/**
 * Registro dos Corvos: o catálogo público dos personagens da Ordem. Cada
 * personagem vinculado ao Foundry ganha um Corvo automaticamente; o mestre
 * também cadastra Corvos avulsos (mortos, aposentados, sem ator no Foundry).
 * Todo campo de correção (`overrides`) vazio usa o valor do Foundry ou o
 * calculado pelo portal.
 */

export const ravenStatuses = ["active", "retired", "dead"] as const;
export const RavenStatusSchema = z.enum(ravenStatuses);

const shortText = (max: number) => z.string().trim().min(1).max(max);
const statValue = z.number().int().min(0).max(999);

export const ravenAttributeKeys = ["strength", "agility", "intellect", "will", "perception"] as const;
export const ravenStatKeys = [
  "health",
  "healingRate",
  "defense",
  "speed",
  "power",
  "insanity",
  "corruption",
] as const;

/** Atributos do sistema; `null` = sem valor conhecido. */
export const RavenAttributesSchema = z
  .object(Object.fromEntries(ravenAttributeKeys.map((key) => [key, statValue.nullable()])) as Record<
    (typeof ravenAttributeKeys)[number],
    z.ZodNullable<typeof statValue>
  >)
  .strict();

/** Vida, defesa e demais valores da ficha; `null` = sem valor conhecido. */
export const RavenStatsSchema = z
  .object(Object.fromEntries(ravenStatKeys.map((key) => [key, statValue.nullable()])) as Record<
    (typeof ravenStatKeys)[number],
    z.ZodNullable<typeof statValue>
  >)
  .strict();

export const RavenPathsSchema = z
  .object({
    novice: z.string().nullable(),
    expert: z.string().nullable(),
    master: z.string().nullable(),
  })
  .strict();

export const RavenMissionRefSchema = z
  .object({
    id: EntityIdSchema,
    title: z.string().min(1),
    number: MissionNumberSchema.nullable(),
    outcome: MissionOutcomeSchema.nullable(),
  })
  .strict();

/** Cartão do hub: o essencial para reconhecer o Corvo. */
export const RavenSummarySchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    name: z.string().min(1),
    status: RavenStatusSchema,
    /** Imagem servida pelo portal (enviada ou retrato do Foundry). */
    imageUrl: z.string().nullable(),
    playerName: z.string().nullable(),
    ancestry: z.string().nullable(),
    paths: RavenPathsSchema,
    level: z.number().int().min(0).max(99).nullable(),
    sessionsPlayed: z.number().int().nonnegative(),
    missionsCompleted: z.number().int().nonnegative(),
    missionsFailed: z.number().int().nonnegative(),
    /** Ligado a um ator do Foundry ou cadastrado à mão. */
    source: z.enum(["foundry", "manual"]),
  })
  .strict();

/** Ficha pública do Corvo. */
export const RavenDetailSchema = RavenSummarySchema.extend({
  lastMission: z
    .union([RavenMissionRefSchema, z.object({ label: z.string().min(1) }).strict()])
    .nullable(),
  /** Atividades da Vida na Sede ("Escriba - Pesquisa"), da mais recente à mais antiga. */
  activities: z.array(z.string()),
  attributes: RavenAttributesSchema,
  stats: RavenStatsSchema,
  missions: z.array(RavenMissionRefSchema),
}).strict();

export const RavenOverridesSchema = z
  .object({
    name: shortText(120).nullable(),
    playerName: shortText(120).nullable(),
    ancestry: shortText(120).nullable(),
    novicePath: shortText(120).nullable(),
    expertPath: shortText(120).nullable(),
    masterPath: shortText(120).nullable(),
    level: z.number().int().min(0).max(99).nullable(),
    sessionsPlayed: z.number().int().min(0).max(9_999).nullable(),
    missionsCompleted: z.number().int().min(0).max(9_999).nullable(),
    missionsFailed: z.number().int().min(0).max(9_999).nullable(),
    lastMission: shortText(200).nullable(),
    activities: z.string().trim().max(1_000).nullable(),
    attributes: RavenAttributesSchema,
    stats: RavenStatsSchema,
  })
  .strict();

/** Valores que o portal calcula ou recebe do Foundry, para o editor mostrar ao lado das correções. */
export const RavenAutomaticSchema = z
  .object({
    name: z.string().nullable(),
    playerName: z.string().nullable(),
    ancestry: z.string().nullable(),
    paths: RavenPathsSchema,
    level: z.number().int().nonnegative().nullable(),
    sessionsPlayed: z.number().int().nonnegative(),
    missionsCompleted: z.number().int().nonnegative(),
    missionsFailed: z.number().int().nonnegative(),
    lastMission: RavenMissionRefSchema.nullable(),
    activities: z.array(z.string()),
    attributes: RavenAttributesSchema,
    stats: RavenStatsSchema,
    hasPortrait: z.boolean(),
  })
  .strict();

export const RavenManagementSchema = z
  .object({
    id: EntityIdSchema,
    campaignId: EntityIdSchema,
    listed: z.boolean(),
    status: RavenStatusSchema,
    userId: EntityIdSchema.nullable(),
    imageMediaId: EntityIdSchema.nullable(),
    foundry: z.object({ worldId: z.string(), actorId: z.string() }).strict().nullable(),
    overrides: RavenOverridesSchema,
    automatic: RavenAutomaticSchema,
    effective: RavenDetailSchema,
    version: z.number().int().positive(),
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const RavenListResponseSchema = z.object({ data: z.array(RavenSummarySchema) }).strict();
export const RavenManagementListResponseSchema = z
  .object({
    data: z.array(RavenManagementSchema),
    members: z.array(z.object({ userId: EntityIdSchema, displayName: z.string() }).strict()),
  })
  .strict();

const ravenFields = {
  status: RavenStatusSchema,
  listed: z.boolean(),
  userId: EntityIdSchema.nullable(),
  imageMediaId: EntityIdSchema.nullable(),
  overrides: RavenOverridesSchema,
};

/** Corvo avulso: o nome é obrigatório, porque não há ator do Foundry para emprestá-lo. */
export const CreateRavenSchema = z
  .object({ ...ravenFields, campaignId: EntityIdSchema })
  .strict()
  .refine((value) => value.overrides.name !== null, {
    message: "Informe o nome do Corvo.",
    path: ["overrides", "name"],
  });

export const UpdateRavenSchema = z
  .object({ ...ravenFields, version: z.number().int().positive() })
  .strict();

/** Corvos que participaram de uma missão (registro da missão). */
export const MissionParticipantsInputSchema = z
  .object({ ravenIds: z.array(EntityIdSchema).max(30) })
  .strict();

export type RavenStatus = z.infer<typeof RavenStatusSchema>;
export type RavenAttributes = z.infer<typeof RavenAttributesSchema>;
export type RavenStats = z.infer<typeof RavenStatsSchema>;
export type RavenMissionRef = z.infer<typeof RavenMissionRefSchema>;
export type RavenSummary = z.infer<typeof RavenSummarySchema>;
export type RavenDetail = z.infer<typeof RavenDetailSchema>;
export type RavenOverrides = z.infer<typeof RavenOverridesSchema>;
export type RavenAutomatic = z.infer<typeof RavenAutomaticSchema>;
export type RavenManagement = z.infer<typeof RavenManagementSchema>;
export type RavenListResponse = z.infer<typeof RavenListResponseSchema>;
export type RavenManagementListResponse = z.infer<typeof RavenManagementListResponseSchema>;
export type CreateRavenInput = z.infer<typeof CreateRavenSchema>;
export type UpdateRavenInput = z.infer<typeof UpdateRavenSchema>;
export type MissionParticipantsInput = z.infer<typeof MissionParticipantsInputSchema>;
