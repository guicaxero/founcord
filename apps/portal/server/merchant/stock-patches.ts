import {
  MerchantStockPatchOperationSchema,
  MerchantStockPatchOutcomeSchema,
  MerchantStockPatchSchema,
  stockEntryFromCatalog,
  type MerchantStockCurrentResponse,
  type MerchantStockPatch,
  type MerchantStockPatchDeliveryCallback,
  type MerchantStockPatchInput,
  type MerchantStockPatchOperation,
} from "@ordem/contracts";
import { z } from "zod";
import type { AuthenticatedSession } from "@/server/identity/session";
import { foundryRequest } from "@/server/integrations/foundry-worlds";
import { getMerchantPurchaseContext } from "@/server/integrations/merchant";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";
import { loadCatalog, requireCatalogManager } from "./catalog";
import { listStockTargets } from "./stock-draws";

type PatchRow = Readonly<{
  id: string;
  campaign_id: string;
  world_id: string;
  operations_json: string;
  outcomes_json: string | null;
  status: MerchantStockPatch["status"];
  error: string | null;
  created_by_name: string;
  created_at: string;
  applied_at: string | null;
}>;

/** Mudança guardada com o nome do item, para mostrar o resultado depois. */
const StoredOperationSchema = z.object({ operation: MerchantStockPatchOperationSchema, name: z.string() }).strict();

const PATCH_SELECT = `SELECT p.id, p.campaign_id, p.world_id, p.operations_json, p.outcomes_json, p.status, p.error,
    u.display_name AS created_by_name, p.created_at, p.applied_at
  FROM merchant_stock_patches p
  INNER JOIN iam_users u ON u.id = p.created_by_user_id`;

function mapPatch(row: PatchRow): MerchantStockPatch {
  const operations = z.array(StoredOperationSchema).parse(JSON.parse(row.operations_json));
  const outcomes = row.outcomes_json ? z.array(MerchantStockPatchOutcomeSchema).parse(JSON.parse(row.outcomes_json)) : [];
  return MerchantStockPatchSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    worldId: row.world_id,
    operations: operations.map((entry, index) => ({ ...entry, outcome: outcomes[index] ?? null })),
    status: row.status,
    error: row.error,
    createdByName: row.created_by_name,
    createdAt: toIsoDateTime(row.created_at),
    appliedAt: toIsoDateTime(row.applied_at),
  });
}

async function findPatch(patchId: string): Promise<MerchantStockPatch | null> {
  const row = await getD1().prepare(`${PATCH_SELECT} WHERE p.id = ?`).bind(patchId).first<PatchRow>();
  return row ? mapPatch(row) : null;
}

/** Estoque real do Lojista no mundo, como o módulo sincronizou por último. */
export async function getCurrentStock(
  session: AuthenticatedSession,
  campaignId: string,
  worldId: string,
  correlationId: string,
): Promise<MerchantStockCurrentResponse> {
  requireCatalogManager(session, campaignId);
  const context = await getMerchantPurchaseContext(campaignId, worldId, correlationId);
  return {
    worldId,
    merchantName: context.catalog?.merchantName ?? null,
    syncedAt: context.catalog?.syncedAt ?? null,
    online: context.connection.status === "online",
    items: context.catalog?.items ?? [],
  };
}

export async function getStockPatch(
  session: AuthenticatedSession,
  campaignId: string,
  patchId: string,
): Promise<MerchantStockPatch> {
  requireCatalogManager(session, campaignId);
  const patch = await findPatch(patchId);
  if (!patch || patch.campaignId !== campaignId) {
    throw new HttpError(404, "stock_patch_not_found", "Edição de estoque não encontrada.");
  }
  return patch;
}

/**
 * Envia ao Foundry só as mudanças feitas no portal. Itens do ator são
 * conferidos contra a última sincronização; itens novos saem do catálogo.
 */
export async function createStockPatch(
  session: AuthenticatedSession,
  campaignId: string,
  input: MerchantStockPatchInput,
  correlationId: string,
): Promise<MerchantStockPatch> {
  requireCatalogManager(session, campaignId);
  const target = (await listStockTargets(session, campaignId, correlationId)).find(
    (candidate) => candidate.worldId === input.worldId,
  );
  if (!target) throw new HttpError(404, "world_not_found", "Mundo não encontrado nesta campanha.");
  if (target.blockedReason === "revoked") {
    throw new HttpError(409, "world_revoked", "Este mundo foi desconectado da campanha.");
  }
  if (target.blockedReason === "merchant_missing") {
    throw new HttpError(
      409,
      "merchant_missing",
      "Escolha o ator do Lojista na tela de conexão do módulo antes de editar o estoque.",
    );
  }
  if (!target.supportsPatch) {
    throw new HttpError(
      409,
      "module_outdated",
      "Atualize o módulo do Foundry para a versão 0.13.0 ou mais nova para editar o estoque item a item.",
    );
  }

  const stock = await getCurrentStock(session, campaignId, input.worldId, correlationId);
  const stockById = new Map(stock.items.map((item) => [item.itemId, item]));
  const catalogById = new Map((await loadCatalog(campaignId)).filter((item) => item.active).map((item) => [item.id, item]));
  const operations = input.operations.map((change): z.infer<typeof StoredOperationSchema> => {
    if (change.op === "add") {
      const item = catalogById.get(change.catalogItemId);
      if (!item) {
        throw new HttpError(
          409,
          "catalog_items_unavailable",
          "Um item novo foi desativado ou removido do catálogo. Atualize a página e revise as mudanças.",
        );
      }
      const operation: MerchantStockPatchOperation = { op: "add", entry: stockEntryFromCatalog(item, change.quantity) };
      return { operation, name: item.name };
    }
    const item = stockById.get(change.itemId);
    if (!item) {
      throw new HttpError(
        409,
        "stock_item_missing",
        "Um dos itens não está mais no Lojista. Atualize o estoque e revise as mudanças.",
      );
    }
    return { operation: change, name: item.name };
  });

  const id = crypto.randomUUID();
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `INSERT INTO merchant_stock_patches (id, campaign_id, created_by_user_id, world_id, operations_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, campaignId, session.user.id, input.worldId, JSON.stringify(operations)),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "merchant.stock.patched",
      entityType: "merchant_stock_patch",
      entityId: id,
      correlationId,
      details: {
        worldId: input.worldId,
        set: input.operations.filter((change) => change.op === "set").length,
        removed: input.operations.filter((change) => change.op === "remove").length,
        added: input.operations.filter((change) => change.op === "add").length,
      },
    }),
  ]);

  try {
    const delivery = (await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(input.worldId)}/commands`,
      {
        method: "POST",
        correlationId,
        idempotencyKey: `portal:merchant-stock-patch:${id}`,
        body: {
          command: {
            type: "merchant.stock.patch",
            payload: {
              patchId: id,
              campaignId,
              operations: operations.map((entry) => entry.operation),
              requestedAt: new Date().toISOString(),
            },
          },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        },
      },
    )) as Readonly<{ commandId: string }>;
    await db
      .prepare(
        `UPDATE merchant_stock_patches SET command_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND command_id IS NULL`,
      )
      .bind(delivery.commandId, id)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível avisar o Foundry.";
    await db
      .prepare(
        `UPDATE merchant_stock_patches SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_delivery'`,
      )
      .bind(message.slice(0, 1_000), id)
      .run();
  }
  return (await findPatch(id))!;
}

/** Resultado do módulo, repassado pelo bridge. */
export async function recordStockPatchDelivery(
  input: MerchantStockPatchDeliveryCallback,
  correlationId: string,
): Promise<MerchantStockPatch> {
  const patch = await findPatch(input.patchId);
  if (!patch) throw new HttpError(404, "stock_patch_not_found", "Edição de estoque não encontrada.");
  if (patch.status !== "pending_delivery") return patch;
  const succeeded = input.outcome === "succeeded";
  const outcomes = succeeded && input.outcomes.length === 0 ? patch.operations.map(() => "applied" as const) : input.outcomes;
  const status = !succeeded ? "failed" : outcomes.every((outcome) => outcome === "applied") ? "applied" : "partial";
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE merchant_stock_patches
         SET status = ?, error = ?, outcomes_json = ?, command_id = COALESCE(command_id, ?),
             applied_at = CASE WHEN ? = 'failed' THEN applied_at ELSE ? END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_delivery'`,
      )
      .bind(
        status,
        succeeded ? null : input.error,
        succeeded ? JSON.stringify(outcomes) : null,
        input.commandId,
        status,
        input.deliveredAt,
        input.patchId,
      ),
    prepareAudit(db, {
      actorUserId: null,
      campaignId: patch.campaignId,
      action: succeeded ? "merchant.stock.patch_applied" : "merchant.stock.patch_failed",
      entityType: "merchant_stock_patch",
      entityId: input.patchId,
      correlationId,
      details: { commandId: input.commandId, status, error: input.error },
    }),
  ]);
  return (await findPatch(input.patchId))!;
}
