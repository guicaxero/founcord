import { requirePermission } from "@ordem/authz";
import {
  CompendiumEntrySchema,
  CompendiumEntrySummarySchema,
  compendiumSourceKey,
  creatureFromFoundryExport,
  spellFromFoundryExport,
  type CompendiumEntry,
  type CompendiumEntrySummary,
  type CompendiumImportInput,
  type CompendiumImportResponse,
  type CompendiumKind,
  type CreatureDraft,
  type CreatureSpell,
} from "@ordem/contracts";
import type { AuthenticatedSession } from "@/server/identity/session";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";

type EntryRow = Readonly<{
  id: string;
  kind: CompendiumKind;
  name: string;
  category: string;
  difficulty: number | null;
  rank: number | null;
  defense: number | null;
  health: number | null;
  data_json?: string;
  updated_at: string;
}>;

const SUMMARY_COLUMNS = "id, kind, name, category, difficulty, rank, defense, health, updated_at";

export function requireCreatureManager(session: AuthenticatedSession, campaignId: string): void {
  requirePermission(session.principal, "creature:manage", { kind: "campaign", campaignId });
}

async function assertCampaignExists(campaignId: string): Promise<void> {
  const found = await getD1()
    .prepare("SELECT 1 AS found FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<{ found: number }>();
  if (!found) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
}

function mapSummary(row: EntryRow): CompendiumEntrySummary {
  return CompendiumEntrySummarySchema.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    category: row.category,
    difficulty: row.difficulty,
    rank: row.rank,
    defense: row.defense,
    health: row.health,
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

/** Resumo do compêndio importado: sem o conteúdo completo, para listas e buscas. */
export async function listCompendium(
  session: AuthenticatedSession,
  campaignId: string,
  kind: CompendiumKind,
): Promise<CompendiumEntrySummary[]> {
  requireCreatureManager(session, campaignId);
  const result = await getD1()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM compendium_entries
       WHERE campaign_id = ? AND kind = ?
       ORDER BY name COLLATE NOCASE`,
    )
    .bind(campaignId, kind)
    .all<EntryRow>();
  return result.results.map(mapSummary);
}

export async function getCompendiumEntry(
  session: AuthenticatedSession,
  campaignId: string,
  entryId: string,
): Promise<CompendiumEntry> {
  requireCreatureManager(session, campaignId);
  return requiredEntry(campaignId, entryId);
}

export async function requiredEntry(campaignId: string, entryId: string): Promise<CompendiumEntry> {
  const row = await getD1()
    .prepare(`SELECT ${SUMMARY_COLUMNS}, data_json FROM compendium_entries WHERE id = ? AND campaign_id = ?`)
    .bind(entryId, campaignId)
    .first<EntryRow>();
  if (!row?.data_json) throw new HttpError(404, "compendium_entry_not_found", "Item do compêndio não encontrado.");
  return CompendiumEntrySchema.parse({ ...mapSummary(row), data: JSON.parse(row.data_json) });
}

type Normalized =
  | Readonly<{ kind: "creature"; data: CreatureDraft }>
  | Readonly<{ kind: "spell"; data: CreatureSpell }>;

function normalize(kind: CompendiumKind, content: unknown): Normalized {
  return kind === "creature"
    ? { kind, data: creatureFromFoundryExport(content) }
    : { kind, data: spellFromFoundryExport(content) };
}

/**
 * Importa arquivos do compêndio enviados pelo mestre. Arquivos repetidos
 * atualizam o registro anterior; arquivos inválidos são listados sem
 * interromper os demais.
 */
export async function importCompendium(
  session: AuthenticatedSession,
  campaignId: string,
  input: CompendiumImportInput,
  correlationId: string,
): Promise<CompendiumImportResponse> {
  requireCreatureManager(session, campaignId);
  await assertCampaignExists(campaignId);
  const db = getD1();
  const skipped: { fileName: string; reason: string }[] = [];
  const prepared: { sourceKey: string; normalized: Normalized }[] = [];

  for (const file of input.files) {
    if (file.fileName.startsWith("_")) {
      skipped.push({ fileName: file.fileName, reason: "Arquivo de manifesto, não é um documento do compêndio." });
      continue;
    }
    try {
      prepared.push({ sourceKey: compendiumSourceKey(file.content, file.fileName), normalized: normalize(input.kind, file.content) });
    } catch (error) {
      skipped.push({
        fileName: file.fileName,
        reason: error instanceof Error ? error.message.slice(0, 200) : "Arquivo inválido.",
      });
    }
  }

  const existing = new Set(
    prepared.length === 0
      ? []
      : (
          await db
            .prepare(
              `SELECT source_key FROM compendium_entries
               WHERE campaign_id = ? AND kind = ? AND source_key IN (${prepared.map(() => "?").join(", ")})`,
            )
            .bind(campaignId, input.kind, ...prepared.map((entry) => entry.sourceKey))
            .all<{ source_key: string }>()
        ).results.map((row) => row.source_key),
  );

  if (prepared.length > 0) {
    await db.batch([
      ...prepared.map(({ sourceKey, normalized }) => {
        const creature = normalized.kind === "creature" ? normalized.data : null;
        const spell = normalized.kind === "spell" ? normalized.data : null;
        return db
          .prepare(
            `INSERT INTO compendium_entries (
               id, campaign_id, kind, source_key, name, category, difficulty, rank, defense, health, data_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(campaign_id, kind, source_key) DO UPDATE SET
               name = excluded.name, category = excluded.category, difficulty = excluded.difficulty,
               rank = excluded.rank, defense = excluded.defense, health = excluded.health,
               data_json = excluded.data_json, updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            crypto.randomUUID(),
            campaignId,
            input.kind,
            sourceKey,
            normalized.data.name,
            creature?.descriptor ?? spell?.tradition ?? "",
            creature?.difficulty ?? null,
            spell?.rank ?? null,
            creature?.defense ?? null,
            creature?.health ?? null,
            JSON.stringify(normalized.data),
          );
      }),
      prepareAudit(db, {
        actorUserId: session.user.id,
        campaignId,
        action: "compendium.imported",
        entityType: "campaign",
        entityId: campaignId,
        correlationId,
        details: { kind: input.kind, files: input.files.length, skipped: skipped.length },
      }),
    ]);
  }

  const updated = prepared.filter((entry) => existing.has(entry.sourceKey)).length;
  return { created: prepared.length - updated, updated, skipped };
}
