import {
  FoundryWorldListResponseSchema,
  MerchantStockCriteriaSchema,
  MerchantStockDrawSchema,
  MerchantStockEntrySchema,
  drawMerchantStock,
  moduleSupportsStockReplace,
  type MerchantStockCriteria,
  type MerchantStockDeliveryCallback,
  type MerchantStockDraw,
  type MerchantStockTarget,
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

type DrawRow = Readonly<{
  id: string;
  campaign_id: string;
  criteria_json: string;
  entries_json: string;
  eligible_count: number;
  status: MerchantStockDraw["status"];
  world_id: string | null;
  error: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}>;

const DRAW_SELECT = `SELECT d.id, d.campaign_id, d.criteria_json, d.entries_json, d.eligible_count,
    d.status, d.world_id, d.error, u.display_name AS created_by_name, d.created_at,
    d.updated_at, d.applied_at
  FROM merchant_stock_draws d
  INNER JOIN iam_users u ON u.id = d.created_by_user_id`;

function mapDraw(row: DrawRow): MerchantStockDraw {
  return MerchantStockDrawSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    criteria: MerchantStockCriteriaSchema.parse(JSON.parse(row.criteria_json)),
    eligibleCount: row.eligible_count,
    entries: z.array(MerchantStockEntrySchema).parse(JSON.parse(row.entries_json)),
    status: row.status,
    worldId: row.world_id,
    error: row.error,
    createdByName: row.created_by_name,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
    appliedAt: toIsoDateTime(row.applied_at),
  });
}

async function findDraw(drawId: string): Promise<MerchantStockDraw | null> {
  const row = await getD1().prepare(`${DRAW_SELECT} WHERE d.id = ?`).bind(drawId).first<DrawRow>();
  return row ? mapDraw(row) : null;
}

async function requiredDraw(campaignId: string, drawId: string): Promise<MerchantStockDraw> {
  const draw = await findDraw(drawId);
  if (!draw || draw.campaignId !== campaignId) {
    throw new HttpError(404, "stock_draw_not_found", "Sorteio não encontrado.");
  }
  return draw;
}

export async function listStockDraws(
  session: AuthenticatedSession,
  campaignId: string,
): Promise<MerchantStockDraw[]> {
  requireCatalogManager(session, campaignId);
  const result = await getD1()
    .prepare(`${DRAW_SELECT} WHERE d.campaign_id = ? AND d.status != 'discarded' ORDER BY d.created_at DESC LIMIT 20`)
    .bind(campaignId)
    .all<DrawRow>();
  return result.results.map(mapDraw);
}

/**
 * Sorteia uma prévia no backend. Prévias anteriores ainda não enviadas são
 * descartadas: "Sortear de novo" substitui a prévia em vez de acumular.
 */
export async function createStockDraw(
  session: AuthenticatedSession,
  campaignId: string,
  criteria: MerchantStockCriteria,
  correlationId: string,
): Promise<MerchantStockDraw> {
  requireCatalogManager(session, campaignId);
  const catalog = await loadCatalog(campaignId);
  if (catalog.length === 0) {
    throw new HttpError(
      409,
      "catalog_empty",
      "O catálogo do Lojista está vazio. Importe a lista base ou cadastre itens antes de sortear.",
    );
  }
  const { eligibleCount, entries } = drawMerchantStock(catalog, criteria);
  if (entries.length === 0) {
    throw new HttpError(
      422,
      "no_eligible_items",
      "Nenhum item do catálogo atende a esses critérios. Aumente a disponibilidade ou escolha outras categorias.",
    );
  }
  const id = crypto.randomUUID();
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE merchant_stock_draws SET status = 'discarded', updated_at = CURRENT_TIMESTAMP
         WHERE campaign_id = ? AND status = 'preview'`,
      )
      .bind(campaignId),
    db
      .prepare(
        `INSERT INTO merchant_stock_draws (
           id, campaign_id, created_by_user_id, criteria_json, entries_json, eligible_count, status
         ) VALUES (?, ?, ?, ?, ?, ?, 'preview')`,
      )
      .bind(id, campaignId, session.user.id, JSON.stringify(criteria), JSON.stringify(entries), eligibleCount),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "merchant.stock.drawn",
      entityType: "merchant_stock_draw",
      entityId: id,
      correlationId,
      details: { ...criteria, items: entries.length, eligibleCount },
    }),
  ]);
  return requiredDraw(campaignId, id);
}

/**
 * Mundos que podem receber o estoque. Só entram mundos com o módulo 0.8.0 ou
 * mais novo e com um ator de Lojista configurado.
 */
export async function listStockTargets(
  session: AuthenticatedSession,
  campaignId: string,
  correlationId: string,
): Promise<MerchantStockTarget[]> {
  requireCatalogManager(session, campaignId);
  const response = await foundryRequest(`/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds`, {
    method: "GET",
    correlationId,
  });
  const worlds = FoundryWorldListResponseSchema.parse({
    data: response && typeof response === "object" && "worlds" in response ? (response as { worlds: unknown }).worlds : [],
  }).data;
  return Promise.all(
    worlds.map(async (world): Promise<MerchantStockTarget> => {
      if (world.status === "revoked") {
        return { ...targetBase(world), merchantName: null, blockedReason: "revoked" };
      }
      const context = await getMerchantPurchaseContext(campaignId, world.worldId, correlationId).catch(() => null);
      const merchantName = context?.catalog?.merchantName ?? null;
      return {
        ...targetBase(world),
        merchantName,
        blockedReason: !moduleSupportsStockReplace(world.moduleVersion)
          ? "module_outdated"
          : merchantName
            ? null
            : "merchant_missing",
      };
    }),
  );
}

function targetBase(world: z.infer<typeof FoundryWorldListResponseSchema>["data"][number]) {
  return {
    worldId: world.worldId,
    worldTitle: world.worldTitle.slice(0, 120) || "Mundo sem nome",
    status: world.status,
    moduleVersion: world.moduleVersion.slice(0, 40),
  };
}

/** Envia a prévia ao Foundry pela fila de comandos do bridge. */
export async function applyStockDraw(
  session: AuthenticatedSession,
  campaignId: string,
  drawId: string,
  worldId: string,
  correlationId: string,
): Promise<MerchantStockDraw> {
  requireCatalogManager(session, campaignId);
  const draw = await requiredDraw(campaignId, drawId);
  if (draw.status === "pending_delivery" || draw.status === "applied") return draw;
  if (draw.status === "discarded") {
    throw new HttpError(409, "stock_draw_discarded", "Esta prévia foi substituída por um sorteio mais novo.");
  }
  const target = (await listStockTargets(session, campaignId, correlationId)).find(
    (candidate) => candidate.worldId === worldId,
  );
  if (!target) throw new HttpError(404, "world_not_found", "Mundo não encontrado nesta campanha.");
  if (target.blockedReason === "module_outdated") {
    throw new HttpError(
      409,
      "module_outdated",
      "Atualize o módulo do Foundry para a versão 0.8.0 ou mais nova antes de enviar o estoque.",
    );
  }
  if (target.blockedReason === "merchant_missing") {
    throw new HttpError(
      409,
      "merchant_missing",
      "Escolha o ator do Lojista na tela de conexão do módulo antes de enviar o estoque.",
    );
  }
  if (target.blockedReason === "revoked") {
    throw new HttpError(409, "world_revoked", "Este mundo foi desconectado da campanha.");
  }

  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE merchant_stock_draws
         SET status = 'pending_delivery', world_id = ?, error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('preview', 'failed')`,
      )
      .bind(worldId, drawId),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "merchant.stock.sent",
      entityType: "merchant_stock_draw",
      entityId: drawId,
      correlationId,
      details: { worldId, items: draw.entries.length },
    }),
  ]);

  try {
    const delivery = (await foundryRequest(
      `/internal/foundry/campaigns/${encodeURIComponent(campaignId)}/worlds/${encodeURIComponent(worldId)}/commands`,
      {
        method: "POST",
        correlationId,
        idempotencyKey: `portal:merchant-stock:${drawId}`,
        body: {
          command: {
            type: "merchant.stock.replace",
            payload: {
              drawId,
              campaignId,
              items: draw.entries,
              requestedAt: new Date().toISOString(),
            },
          },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        },
      },
    )) as Readonly<{ commandId: string }>;
    await db
      .prepare(
        `UPDATE merchant_stock_draws SET command_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND command_id IS NULL`,
      )
      .bind(delivery.commandId, drawId)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível avisar o Foundry.";
    await db
      .prepare(
        `UPDATE merchant_stock_draws SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_delivery'`,
      )
      .bind(message.slice(0, 1_000), drawId)
      .run();
  }
  return requiredDraw(campaignId, drawId);
}

/** Resultado do módulo, repassado pelo bridge. */
export async function recordStockDelivery(
  input: MerchantStockDeliveryCallback,
  correlationId: string,
): Promise<MerchantStockDraw> {
  const draw = await findDraw(input.drawId);
  if (!draw) throw new HttpError(404, "stock_draw_not_found", "Sorteio não encontrado.");
  if (draw.status !== "pending_delivery") return draw;
  const applied = input.outcome === "succeeded";
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE merchant_stock_draws
         SET status = ?, error = ?, command_id = COALESCE(command_id, ?),
             applied_at = CASE WHEN ? = 'applied' THEN ? ELSE applied_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_delivery'`,
      )
      .bind(
        applied ? "applied" : "failed",
        applied ? null : input.error,
        input.commandId,
        applied ? "applied" : "failed",
        input.deliveredAt,
        input.drawId,
      ),
    prepareAudit(db, {
      actorUserId: null,
      campaignId: draw.campaignId,
      action: applied ? "merchant.stock.applied" : "merchant.stock.failed",
      entityType: "merchant_stock_draw",
      entityId: input.drawId,
      correlationId,
      details: { commandId: input.commandId, error: input.error },
    }),
  ]);
  return (await findDraw(input.drawId))!;
}
