import { hasPermission, requirePermission } from "@ordem/authz";
import {
  MerchantPurchaseListResponseSchema,
  MerchantPurchaseRequestSchema,
  type MerchantPurchaseDecisionInput,
  type MerchantPurchaseDeliveryCallback,
  type MerchantPurchaseRequest,
  type MerchantPurchaseRequestInput,
  type MerchantPurchaseStatus,
} from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import { prepareAudit } from "@/server/shared/audit";
import type { AuthenticatedSession } from "@/server/identity/session";
import {
  enqueueMerchantPurchaseRequest,
  getMerchantPurchaseContext,
} from "@/server/integrations/merchant";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";

type PurchaseRow = Readonly<{
  id: string;
  campaign_id: string;
  requester_user_id: string;
  requester_name: string;
  buyer_actor_name: string;
  item_id: string;
  item_name: string;
  price_snapshot: string;
  quantity: number;
  note: string | null;
  status: MerchantPurchaseStatus;
  delivery_error: string | null;
  resolution_note: string | null;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}>;

type BuyerLinkRow = Readonly<{
  world_id: string;
  foundry_actor_id: string;
  actor_name: string;
  is_active: number | null;
}>;

export async function listMerchantPurchases(
  session: AuthenticatedSession,
  campaignId: string,
  ownOnly = false,
): Promise<MerchantPurchaseRequest[]> {
  const canManage = hasPermission(session.principal, "merchant:purchase:manage", {
    kind: "campaign",
    campaignId,
  });
  if (!canManage) {
    requirePermission(session.principal, "merchant:purchase:request", {
      kind: "campaign",
      campaignId,
    });
  }
  await assertCampaignExists(campaignId);
  const scopedToRequester = ownOnly || !canManage;
  const scope = scopedToRequester ? " AND p.requester_user_id = ?" : "";
  const rows = await getD1()
    .prepare(`${purchaseSelect()} WHERE p.campaign_id = ?${scope}
              ORDER BY
                CASE p.status
                  WHEN 'pending_delivery' THEN 0 WHEN 'awaiting_master' THEN 1
                  WHEN 'delivery_failed' THEN 2 ELSE 3
                END,
                datetime(p.created_at) DESC`)
    .bind(...(scopedToRequester ? [campaignId, session.user.id] : [campaignId]))
    .all<PurchaseRow>();
  return MerchantPurchaseListResponseSchema.parse({
    data: rows.results.map(mapPurchase),
  }).data;
}

export async function createMerchantPurchase(
  session: AuthenticatedSession,
  campaignId: string,
  input: MerchantPurchaseRequestInput,
  correlationId: string,
): Promise<MerchantPurchaseRequest> {
  requirePermission(session.principal, "merchant:purchase:request", {
    kind: "campaign",
    campaignId,
  });
  const db = getD1();
  const existing = await findPurchase(input.requestId);
  if (existing) {
    assertSamePurchaseRequest(existing, session, campaignId, input);
    return existing;
  }

  const link = await db
    .prepare(
      `SELECT l.world_id, l.foundry_actor_id, l.actor_name, p.is_active
       FROM campaign_character_links l
       INNER JOIN campaign_members cm
         ON cm.campaign_id = l.campaign_id AND cm.user_id = l.user_id
       LEFT JOIN foundry_character_projections p
         ON p.campaign_id = l.campaign_id AND p.world_id = l.world_id
        AND p.foundry_actor_id = l.foundry_actor_id
       WHERE l.campaign_id = ? AND l.user_id = ? AND cm.status = 'active'`,
    )
    .bind(campaignId, session.user.id)
    .first<BuyerLinkRow>();
  if (!link) {
    throw new HttpError(
      422,
      "character_link_required",
      "Vincule um personagem do Foundry antes de enviar um pedido.",
    );
  }
  if (!link.is_active) {
    throw new HttpError(
      409,
      "character_unavailable",
      "Seu personagem não está disponível na sincronização atual. Peça ao mestre para atualizar os personagens.",
    );
  }

  const context = await getMerchantPurchaseContext(
    campaignId,
    link.world_id,
    correlationId,
  );
  if (!context.catalog) {
    throw new HttpError(
      409,
      "merchant_catalog_unavailable",
      "O mundo do seu personagem ainda não publicou o catálogo do Lojista.",
    );
  }
  const item = context.catalog.items.find((candidate) => candidate.itemId === input.itemId);
  if (!item) {
    throw new HttpError(
      409,
      "merchant_item_changed",
      "Este item não está mais no catálogo. Atualize a página antes de tentar novamente.",
    );
  }
  if (!item.price) {
    throw new HttpError(
      422,
      "merchant_price_required",
      "O item precisa ter um preço registrado no Foundry antes de ser solicitado.",
    );
  }
  if (item.quantity === null || item.quantity < input.quantity) {
    throw new HttpError(
      409,
      "merchant_stock_changed",
      "A quantidade solicitada não está mais disponível. Atualize o catálogo.",
    );
  }

  const requestedAt = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO merchant_purchase_requests (
           id, campaign_id, requester_user_id, world_id, buyer_actor_id,
           buyer_actor_name, merchant_actor_id, catalog_sync_id, item_id,
           item_name, price_snapshot, quantity, note, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_delivery', ?, ?)`,
      ).bind(
        input.requestId,
        campaignId,
        session.user.id,
        link.world_id,
        link.foundry_actor_id,
        link.actor_name,
        context.catalog.merchantActorId,
        context.catalog.syncId,
        item.itemId,
        item.name,
        item.price,
        input.quantity,
        input.note,
        requestedAt,
        requestedAt,
      ),
      prepareAudit(db, {
        actorUserId: session.user.id,
        campaignId,
        action: "merchant.purchase.requested",
        entityType: "merchant_purchase_request",
        entityId: input.requestId,
        correlationId,
        details: {
          actorName: link.actor_name,
          itemName: item.name,
          price: item.price,
          quantity: input.quantity,
        },
      }),
    ]);
  } catch (error) {
    // Duas tentativas simultâneas podem ultrapassar a leitura inicial. A chave
    // primária decide qual delas venceu; a outra reutiliza o mesmo pedido lógico.
    const concurrent = await findPurchase(input.requestId);
    if (!concurrent) throw error;
    assertSamePurchaseRequest(concurrent, session, campaignId, input);
    return concurrent;
  }

  try {
    const delivery = await enqueueMerchantPurchaseRequest(
      campaignId,
      link.world_id,
      input.requestId,
      {
        command: {
          type: "merchant.purchase.request",
          payload: {
            requestId: input.requestId,
            campaignId,
            merchantActorId: context.catalog.merchantActorId,
            buyer: {
              userId: session.user.id,
              displayName: session.user.displayName,
              actorId: link.foundry_actor_id,
              actorName: link.actor_name,
            },
            item: {
              itemId: item.itemId,
              name: item.name,
              price: item.price,
              quantity: input.quantity,
            },
            note: input.note,
            requestedAt,
          },
        },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
      },
      correlationId,
    );
    await db.prepare(
      `UPDATE merchant_purchase_requests SET command_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending_delivery'`,
    ).bind(delivery.commandId, input.requestId).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível avisar o Foundry.";
    await db.batch([
      db.prepare(
        `UPDATE merchant_purchase_requests
         SET status = 'delivery_failed', delivery_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_delivery'`,
      ).bind(message.slice(0, 1_000), input.requestId),
      prepareAudit(db, {
        actorUserId: session.user.id,
        campaignId,
        action: "merchant.purchase.delivery_failed",
        entityType: "merchant_purchase_request",
        entityId: input.requestId,
        correlationId,
        details: { message: message.slice(0, 500) },
      }),
    ]);
  }
  return requiredPurchase(input.requestId);
}

export async function decideMerchantPurchase(
  session: AuthenticatedSession,
  campaignId: string,
  purchaseId: string,
  input: MerchantPurchaseDecisionInput,
  correlationId: string,
): Promise<MerchantPurchaseRequest> {
  const existing = await requiredPurchase(purchaseId);
  if (existing.campaignId !== campaignId) throw purchaseNotFound();
  const isRequester = existing.requester.userId === session.user.id;
  const canManage = hasPermission(session.principal, "merchant:purchase:manage", {
    kind: "campaign",
    campaignId,
  });
  if (input.action === "cancel") {
    requirePermission(session.principal, "merchant:purchase:request", {
      kind: "campaign",
      campaignId,
    });
    if (!isRequester) throw purchaseNotFound();
  } else if (!canManage) {
    requirePermission(session.principal, "merchant:purchase:manage", {
      kind: "campaign",
      campaignId,
    });
  }

  const allowed = input.action === "cancel"
    ? ["pending_delivery", "awaiting_master", "delivery_failed"]
    : ["awaiting_master"];
  if (!allowed.includes(existing.status)) {
    throw new HttpError(
      409,
      "purchase_already_decided",
      "Este pedido não pode mais mudar de estado.",
    );
  }
  const status: MerchantPurchaseStatus = input.action === "fulfill"
    ? "fulfilled"
    : input.action === "reject"
      ? "rejected"
      : "cancelled";
  const db = getD1();
  const result = await db.prepare(
    `UPDATE merchant_purchase_requests
     SET status = ?, resolution_note = ?, resolved_by_user_id = ?,
         resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND campaign_id = ? AND status = ?`,
  ).bind(
    status,
    input.resolutionNote,
    session.user.id,
    purchaseId,
    campaignId,
    existing.status,
  ).run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new HttpError(409, "purchase_state_changed", "O pedido acabou de ser atualizado. Recarregue a lista.");
  }
  await prepareAudit(db, {
    actorUserId: session.user.id,
    campaignId,
    action: `merchant.purchase.${status}`,
    entityType: "merchant_purchase_request",
    entityId: purchaseId,
    correlationId,
    details: { previousStatus: existing.status, resolutionNote: input.resolutionNote },
  }).run();
  return requiredPurchase(purchaseId);
}

export async function recordMerchantPurchaseDelivery(
  input: MerchantPurchaseDeliveryCallback,
  correlationId: string,
): Promise<MerchantPurchaseRequest> {
  const existing = await requiredPurchase(input.requestId);
  if (existing.status !== "pending_delivery" && existing.status !== "delivery_failed") {
    return existing;
  }
  if (existing.status === "delivery_failed" && input.outcome === "failed") {
    return existing;
  }
  const nextStatus: MerchantPurchaseStatus = input.outcome === "succeeded"
    ? "awaiting_master"
    : "delivery_failed";
  const db = getD1();
  await db.batch([
    db.prepare(
      `UPDATE merchant_purchase_requests
       SET status = ?, command_id = COALESCE(command_id, ?), delivery_error = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('pending_delivery', 'delivery_failed')`,
    ).bind(nextStatus, input.commandId, input.error, input.requestId),
    prepareAudit(db, {
      actorUserId: null,
      campaignId: existing.campaignId,
      action: input.outcome === "succeeded"
        ? "merchant.purchase.delivered"
        : "merchant.purchase.delivery_failed",
      entityType: "merchant_purchase_request",
      entityId: input.requestId,
      correlationId,
      details: { commandId: input.commandId, error: input.error },
    }),
  ]);
  return requiredPurchase(input.requestId);
}

async function assertCampaignExists(campaignId: string): Promise<void> {
  const campaign = await getD1().prepare("SELECT 1 AS found FROM campaigns WHERE id = ?")
    .bind(campaignId).first<{ found: number }>();
  if (!campaign) throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
}

async function findPurchase(id: string): Promise<MerchantPurchaseRequest | null> {
  const row = await getD1().prepare(`${purchaseSelect()} WHERE p.id = ?`)
    .bind(id).first<PurchaseRow>();
  return row ? MerchantPurchaseRequestSchema.parse(mapPurchase(row)) : null;
}

async function requiredPurchase(id: string): Promise<MerchantPurchaseRequest> {
  const purchase = await findPurchase(id);
  if (!purchase) throw purchaseNotFound();
  return purchase;
}

function purchaseNotFound(): HttpError {
  return new HttpError(404, "merchant_purchase_not_found", "Pedido não encontrado.");
}

function assertSamePurchaseRequest(
  existing: MerchantPurchaseRequest,
  session: AuthenticatedSession,
  campaignId: string,
  input: MerchantPurchaseRequestInput,
): void {
  if (
    existing.campaignId !== campaignId ||
    existing.requester.userId !== session.user.id ||
    existing.item.itemId !== input.itemId ||
    existing.item.quantity !== input.quantity ||
    existing.note !== input.note
  ) {
    throw new HttpError(
      409,
      "purchase_idempotency_conflict",
      "Este identificador de pedido já foi usado com outros dados.",
    );
  }
}

function purchaseSelect(): string {
  return `SELECT p.id, p.campaign_id, p.requester_user_id,
                 requester.display_name AS requester_name,
                 p.buyer_actor_name, p.item_id, p.item_name, p.price_snapshot,
                 p.quantity, p.note, p.status, p.delivery_error,
                 p.resolution_note, resolver.display_name AS resolved_by_name,
                 p.created_at, p.updated_at, p.resolved_at
          FROM merchant_purchase_requests p
          INNER JOIN iam_users requester ON requester.id = p.requester_user_id
          LEFT JOIN iam_users resolver ON resolver.id = p.resolved_by_user_id`;
}

function mapPurchase(row: PurchaseRow): MerchantPurchaseRequest {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    requester: { userId: row.requester_user_id, displayName: row.requester_name },
    character: { actorName: row.buyer_actor_name },
    item: {
      itemId: row.item_id,
      name: row.item_name,
      price: row.price_snapshot,
      quantity: row.quantity,
    },
    note: row.note,
    status: row.status,
    deliveryError: row.delivery_error,
    resolutionNote: row.resolution_note,
    resolvedByName: row.resolved_by_name,
    createdAt: toIsoDateTime(row.created_at)!,
    updatedAt: toIsoDateTime(row.updated_at)!,
    resolvedAt: toIsoDateTime(row.resolved_at),
  };
}
