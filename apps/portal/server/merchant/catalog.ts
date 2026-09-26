import { requirePermission } from "@ordem/authz";
import {
  MerchantCatalogItemInputSchema,
  MerchantCatalogItemSchema,
  type MerchantCatalogImportResponse,
  type MerchantCatalogItem,
  type MerchantCatalogItemInput,
  type MerchantCatalogItemUpdate,
} from "@ordem/contracts";
import type { D1Database } from "@cloudflare/workers-types";
import type { AuthenticatedSession } from "@/server/identity/session";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";
import { BASE_MERCHANT_CATALOG } from "./base-catalog";

type CatalogRow = Readonly<{
  id: string;
  campaign_id: string;
  name: string;
  category: string;
  kind: MerchantCatalogItem["kind"];
  availability: MerchantCatalogItem["availability"];
  price: string | null;
  damage: string | null;
  hands: MerchantCatalogItem["hands"];
  agility: string | null;
  fixed: string | null;
  requirement_attribute: NonNullable<MerchantCatalogItem["requirement"]>["attribute"] | null;
  requirement_minimum: number | null;
  properties: string | null;
  description: string | null;
  icon: string | null;
  source: string;
  active: number;
  version: number;
  created_at: string;
  updated_at: string;
}>;

const COLUMNS = `id, campaign_id, name, category, kind, availability, price, damage, hands,
  agility, fixed, requirement_attribute, requirement_minimum, properties, description,
  icon, source, active, version, created_at, updated_at`;

export function requireCatalogManager(session: AuthenticatedSession, campaignId: string): void {
  requirePermission(session.principal, "merchant:catalog:manage", { kind: "campaign", campaignId });
}

function mapRow(row: CatalogRow): MerchantCatalogItem {
  return MerchantCatalogItemSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    category: row.category,
    kind: row.kind,
    availability: row.availability,
    price: row.price,
    damage: row.damage,
    hands: row.hands,
    agility: row.agility,
    fixed: row.fixed,
    requirement:
      row.requirement_attribute && row.requirement_minimum
        ? { attribute: row.requirement_attribute, minimum: row.requirement_minimum }
        : null,
    properties: row.properties,
    description: row.description,
    icon: row.icon,
    source: row.source,
    active: Boolean(row.active),
    version: row.version,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

async function assertCampaignExists(campaignId: string): Promise<void> {
  const found = await getD1()
    .prepare("SELECT 1 AS found FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<{ found: number }>();
  if (!found) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
}

/** Todos os itens do catálogo, ativos ou não, ordenados como na planilha. */
export async function loadCatalog(campaignId: string): Promise<MerchantCatalogItem[]> {
  const result = await getD1()
    .prepare(
      `SELECT ${COLUMNS} FROM merchant_catalog_items
       WHERE campaign_id = ?
       ORDER BY category COLLATE NOCASE, name COLLATE NOCASE`,
    )
    .bind(campaignId)
    .all<CatalogRow>();
  return result.results.map(mapRow);
}

export async function listCatalog(
  session: AuthenticatedSession,
  campaignId: string,
): Promise<MerchantCatalogItem[]> {
  requireCatalogManager(session, campaignId);
  await assertCampaignExists(campaignId);
  return loadCatalog(campaignId);
}

async function findItem(campaignId: string, itemId: string): Promise<MerchantCatalogItem> {
  const row = await getD1()
    .prepare(`SELECT ${COLUMNS} FROM merchant_catalog_items WHERE id = ? AND campaign_id = ?`)
    .bind(itemId, campaignId)
    .first<CatalogRow>();
  if (!row) throw new HttpError(404, "catalog_item_not_found", "Item do catálogo não encontrado.");
  return mapRow(row);
}

function insertStatement(
  db: D1Database,
  campaignId: string,
  id: string,
  input: MerchantCatalogItemInput,
  mode: "strict" | "ignore",
) {
  const item = MerchantCatalogItemInputSchema.parse(input);
  return db
    .prepare(
      `INSERT ${mode === "ignore" ? "OR IGNORE " : ""}INTO merchant_catalog_items (
         id, campaign_id, name, category, kind, availability, price, damage, hands, agility,
         fixed, requirement_attribute, requirement_minimum, properties, description, icon, source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      campaignId,
      item.name,
      item.category,
      item.kind,
      item.availability,
      item.price,
      item.damage,
      item.hands,
      item.agility,
      item.fixed,
      item.requirement?.attribute ?? null,
      item.requirement?.minimum ?? null,
      item.properties,
      item.description,
      item.icon,
      item.source,
    );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/iu.test(error.message);
}

function duplicateNameError(): HttpError {
  return new HttpError(
    409,
    "catalog_item_duplicate",
    "Já existe um item com esse nome nessa categoria.",
    { name: ["Já existe um item com esse nome nessa categoria."] },
  );
}

export async function createCatalogItem(
  session: AuthenticatedSession,
  campaignId: string,
  input: MerchantCatalogItemInput,
  correlationId: string,
): Promise<MerchantCatalogItem> {
  requireCatalogManager(session, campaignId);
  await assertCampaignExists(campaignId);
  const db = getD1();
  const id = crypto.randomUUID();
  try {
    await db.batch([
      insertStatement(db, campaignId, id, input, "strict"),
      prepareAudit(db, {
        actorUserId: session.user.id,
        campaignId,
        action: "merchant.catalog.created",
        entityType: "merchant_catalog_item",
        entityId: id,
        correlationId,
        details: { name: input.name, category: input.category },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateNameError();
    throw error;
  }
  return findItem(campaignId, id);
}

export async function updateCatalogItem(
  session: AuthenticatedSession,
  campaignId: string,
  itemId: string,
  update: MerchantCatalogItemUpdate,
  correlationId: string,
): Promise<MerchantCatalogItem> {
  requireCatalogManager(session, campaignId);
  const current = await findItem(campaignId, itemId);
  if (current.version !== update.version) {
    throw new HttpError(
      409,
      "catalog_item_version_conflict",
      "Este item foi alterado por outra pessoa. Recarregue a lista e tente de novo.",
    );
  }
  const { active } = update;
  // Só os campos enviados sobrescrevem o item atual; versão e situação têm tratamento próprio.
  const fields = Object.fromEntries(
    Object.entries(update).filter(([key, value]) => key !== "version" && key !== "active" && value !== undefined),
  );
  const next = MerchantCatalogItemInputSchema.parse({
    name: current.name,
    category: current.category,
    kind: current.kind,
    availability: current.availability,
    price: current.price,
    damage: current.damage,
    hands: current.hands,
    agility: current.agility,
    fixed: current.fixed,
    requirement: current.requirement,
    properties: current.properties,
    description: current.description,
    icon: current.icon,
    source: current.source,
    ...fields,
  });
  const db = getD1();
  try {
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE merchant_catalog_items SET
             name = ?, category = ?, kind = ?, availability = ?, price = ?, damage = ?, hands = ?,
             agility = ?, fixed = ?, requirement_attribute = ?, requirement_minimum = ?,
             properties = ?, description = ?, icon = ?, source = ?, active = ?,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND campaign_id = ? AND version = ?`,
        )
        .bind(
          next.name,
          next.category,
          next.kind,
          next.availability,
          next.price,
          next.damage,
          next.hands,
          next.agility,
          next.fixed,
          next.requirement?.attribute ?? null,
          next.requirement?.minimum ?? null,
          next.properties,
          next.description,
          next.icon,
          next.source,
          (active ?? current.active) ? 1 : 0,
          itemId,
          campaignId,
          update.version,
        ),
      prepareAudit(db, {
        actorUserId: session.user.id,
        campaignId,
        action:
          active === false
            ? "merchant.catalog.deactivated"
            : active === true && !current.active
              ? "merchant.catalog.reactivated"
              : "merchant.catalog.updated",
        entityType: "merchant_catalog_item",
        entityId: itemId,
        correlationId,
        details: { name: next.name },
      }),
    ]);
    if (!result?.meta.changes) {
      throw new HttpError(
        409,
        "catalog_item_version_conflict",
        "Este item foi alterado por outra pessoa. Recarregue a lista e tente de novo.",
      );
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateNameError();
    throw error;
  }
  return findItem(campaignId, itemId);
}

/**
 * Traz a lista base (planilha do Lojista) para a campanha. Itens com o mesmo
 * nome e categoria já cadastrados são mantidos como estão.
 */
export async function importBaseCatalog(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<MerchantCatalogImportResponse> {
  requireCatalogManager(session, campaignId);
  await assertCampaignExists(campaignId);
  const db = getD1();
  const results = await db.batch(
    BASE_MERCHANT_CATALOG.map((item) => insertStatement(db, campaignId, crypto.randomUUID(), item, "ignore")),
  );
  const created = results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
  await db.batch([
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "merchant.catalog.imported",
      entityType: "campaign",
      entityId: campaignId,
      correlationId,
      details: { created, total: BASE_MERCHANT_CATALOG.length },
    }),
  ]);
  return { created, skipped: BASE_MERCHANT_CATALOG.length - created };
}
