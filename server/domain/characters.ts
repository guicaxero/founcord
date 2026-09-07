import { hasPermission, requirePermission } from "@vigilia/authz";
import {
  CampaignCharacterLinkManagementResponseSchema,
  CampaignCharacterLinkSchema,
  PlayerCharacterListResponseSchema,
  type CampaignCharacterLink,
  type CampaignCharacterLinkInput,
  type CampaignCharacterLinkManagementResponse,
  type CampaignCharacterProjection,
  type PlayerCharacterListResponse,
} from "@vigilia/contracts";
import { getD1 } from "@/db";
import { prepareAudit } from "@/server/audit";
import type { AuthenticatedSession } from "@/server/auth/session";
import { HttpError } from "@/server/http";
import { toIsoDateTime } from "@/server/time";

type CharacterRow = Readonly<{
  world_id: string;
  foundry_actor_id: string;
  name: string;
  level: number;
  ancestry: string | null;
  novice_path: string | null;
  expert_path: string | null;
  master_path: string | null;
  legendary_path: string | null;
  health_max: number;
  damage: number;
  healing_rate: number;
  insanity: number;
  corruption: number;
  source_updated_at: string;
  last_synced_at: string;
  is_active: number;
}>;

type LinkRow = Readonly<{
  id: string;
  campaign_id: string;
  user_id: string;
  world_id: string;
  foundry_actor_id: string;
  actor_name: string;
  created_at: string;
  updated_at: string;
  projection_world_id: string | null;
  projection_actor_id: string | null;
  projection_name: string | null;
  level: number | null;
  ancestry: string | null;
  novice_path: string | null;
  expert_path: string | null;
  master_path: string | null;
  legendary_path: string | null;
  health_max: number | null;
  damage: number | null;
  healing_rate: number | null;
  insanity: number | null;
  corruption: number | null;
  source_updated_at: string | null;
  last_synced_at: string | null;
  is_active: number | null;
}>;

type MembershipRow = Readonly<{
  campaign_id: string;
  campaign_name: string;
}>;

export async function listCampaignCharacterLinks(
  session: AuthenticatedSession,
  campaignId: string,
): Promise<CampaignCharacterLinkManagementResponse> {
  requirePermission(session.principal, "character:link:manage", {
    kind: "campaign",
    campaignId,
  });
  await assertCampaignExists(campaignId);
  const db = getD1();
  const [candidateResult, linkResult] = await Promise.all([
    db
      .prepare(
        `SELECT world_id, foundry_actor_id, name, level, ancestry,
                novice_path, expert_path, master_path, legendary_path,
                health_max, damage, healing_rate, insanity, corruption,
                source_updated_at, last_synced_at, is_active
         FROM foundry_character_projections
         WHERE campaign_id = ? AND is_active = 1
         ORDER BY name COLLATE NOCASE, world_id`,
      )
      .bind(campaignId)
      .all<CharacterRow>(),
    db.prepare(linkSelect("WHERE l.campaign_id = ? ORDER BY l.actor_name COLLATE NOCASE"))
      .bind(campaignId)
      .all<LinkRow>(),
  ]);

  return CampaignCharacterLinkManagementResponseSchema.parse({
    data: {
      candidates: candidateResult.results.map(mapCharacter),
      links: linkResult.results.map(mapLink),
    },
  });
}

export async function saveCampaignCharacterLink(
  session: AuthenticatedSession,
  campaignId: string,
  userId: string,
  input: CampaignCharacterLinkInput,
  correlationId: string,
): Promise<CampaignCharacterLink> {
  requirePermission(session.principal, "character:link:manage", {
    kind: "campaign",
    campaignId,
  });
  const db = getD1();
  const member = await db
    .prepare(
      `SELECT 1 AS found FROM campaign_members
       WHERE campaign_id = ? AND user_id = ? AND status = 'active'`,
    )
    .bind(campaignId, userId)
    .first<{ found: number }>();
  if (!member) {
    throw new HttpError(
      422,
      "active_member_required",
      "Reative a participação deste membro antes de vincular um personagem.",
    );
  }

  const actor = await db
    .prepare(
      `SELECT world_id, foundry_actor_id, name FROM foundry_character_projections
       WHERE campaign_id = ? AND world_id = ? AND foundry_actor_id = ?
         AND is_active = 1`,
    )
    .bind(campaignId, input.worldId, input.actorId)
    .first<{ world_id: string; foundry_actor_id: string; name: string }>();
  if (!actor) {
    throw new HttpError(
      422,
      "character_unavailable",
      "Este personagem não está disponível na sincronização atual da campanha.",
    );
  }

  const occupied = await db
    .prepare(
      `SELECT user_id FROM campaign_character_links
       WHERE world_id = ? AND foundry_actor_id = ? AND user_id <> ?`,
    )
    .bind(input.worldId, input.actorId, userId)
    .first<{ user_id: string }>();
  if (occupied) {
    throw new HttpError(
      409,
      "character_already_linked",
      "Este personagem já está vinculado a outro membro da campanha.",
    );
  }

  const previous = await db
    .prepare(
      `SELECT id, world_id, foundry_actor_id, actor_name
       FROM campaign_character_links WHERE campaign_id = ? AND user_id = ?`,
    )
    .bind(campaignId, userId)
    .first<{
      id: string;
      world_id: string;
      foundry_actor_id: string;
      actor_name: string;
    }>();
  const linkId = previous?.id ?? crypto.randomUUID();

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaign_character_links (
             id, campaign_id, user_id, world_id, foundry_actor_id,
             actor_name, linked_by_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(campaign_id, user_id) DO UPDATE SET
             world_id = excluded.world_id,
             foundry_actor_id = excluded.foundry_actor_id,
             actor_name = excluded.actor_name,
             linked_by_user_id = excluded.linked_by_user_id,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          linkId,
          campaignId,
          userId,
          actor.world_id,
          actor.foundry_actor_id,
          actor.name,
          session.user.id,
        ),
      prepareAudit(db, {
        actorUserId: session.user.id,
        campaignId,
        action: previous ? "character.link.changed" : "character.link.created",
        entityType: "campaign_character_link",
        entityId: linkId,
        correlationId,
        details: {
          memberUserId: userId,
          previous: previous
            ? {
                worldId: previous.world_id,
                actorId: previous.foundry_actor_id,
                actorName: previous.actor_name,
              }
            : null,
          next: {
            worldId: actor.world_id,
            actorId: actor.foundry_actor_id,
            actorName: actor.name,
          },
        },
      }),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) {
      throw new HttpError(
        409,
        "character_already_linked",
        "Este personagem acabou de ser vinculado a outro membro. Atualize a lista e escolha outro.",
      );
    }
    throw error;
  }

  return getLink(campaignId, userId);
}

export async function removeCampaignCharacterLink(
  session: AuthenticatedSession,
  campaignId: string,
  userId: string,
  correlationId: string,
): Promise<Readonly<{ removed: true }>> {
  requirePermission(session.principal, "character:link:manage", {
    kind: "campaign",
    campaignId,
  });
  const existing = await getLink(campaignId, userId);
  const db = getD1();
  await db.batch([
    db
      .prepare(
        "DELETE FROM campaign_character_links WHERE campaign_id = ? AND user_id = ?",
      )
      .bind(campaignId, userId),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "character.link.removed",
      entityType: "campaign_character_link",
      entityId: existing.id,
      correlationId,
      details: {
        memberUserId: userId,
        previous: {
          worldId: existing.worldId,
          actorId: existing.actorId,
          actorName: existing.actorName,
        },
      },
    }),
  ]);
  return { removed: true };
}

export async function listMyCharacters(
  session: AuthenticatedSession,
): Promise<PlayerCharacterListResponse> {
  const db = getD1();
  const memberships = await db
    .prepare(
      `SELECT c.id AS campaign_id, c.name AS campaign_name
       FROM campaign_members cm
       INNER JOIN campaigns c ON c.id = cm.campaign_id
       WHERE cm.user_id = ? AND cm.status = 'active' AND c.status = 'active'
       ORDER BY c.name COLLATE NOCASE`,
    )
    .bind(session.user.id)
    .all<MembershipRow>();

  const visible = memberships.results.filter((row) =>
    hasPermission(session.principal, "character:self:read", {
      kind: "campaign",
      campaignId: row.campaign_id,
    }),
  );
  const entries = await Promise.all(
    visible.map(async (row) => {
      const link = await db
        .prepare(linkSelect("WHERE l.campaign_id = ? AND l.user_id = ?"))
        .bind(row.campaign_id, session.user.id)
        .first<LinkRow>();
      return {
        campaign: { id: row.campaign_id, name: row.campaign_name },
        link: link ? mapLink(link) : null,
      };
    }),
  );
  return PlayerCharacterListResponseSchema.parse({ data: entries });
}

async function getLink(
  campaignId: string,
  userId: string,
): Promise<CampaignCharacterLink> {
  const row = await getD1()
    .prepare(linkSelect("WHERE l.campaign_id = ? AND l.user_id = ?"))
    .bind(campaignId, userId)
    .first<LinkRow>();
  if (!row) {
    throw new HttpError(
      404,
      "character_link_not_found",
      "Este membro ainda não possui um personagem vinculado.",
    );
  }
  return CampaignCharacterLinkSchema.parse(mapLink(row));
}

async function assertCampaignExists(campaignId: string): Promise<void> {
  const campaign = await getD1()
    .prepare("SELECT 1 AS found FROM campaigns WHERE id = ?")
    .bind(campaignId)
    .first<{ found: number }>();
  if (!campaign) {
    throw new HttpError(404, "campaign_not_found", "Campanha não encontrada.");
  }
}

function linkSelect(suffix: string): string {
  return `SELECT l.id, l.campaign_id, l.user_id, l.world_id,
                 l.foundry_actor_id, l.actor_name, l.created_at, l.updated_at,
                 p.world_id AS projection_world_id,
                 p.foundry_actor_id AS projection_actor_id,
                 p.name AS projection_name, p.level, p.ancestry,
                 p.novice_path, p.expert_path, p.master_path, p.legendary_path,
                 p.health_max, p.damage, p.healing_rate, p.insanity,
                 p.corruption, p.source_updated_at, p.last_synced_at, p.is_active
          FROM campaign_character_links l
          LEFT JOIN foundry_character_projections p
            ON p.campaign_id = l.campaign_id
           AND p.world_id = l.world_id
           AND p.foundry_actor_id = l.foundry_actor_id
          ${suffix}`;
}

function mapLink(row: LinkRow): CampaignCharacterLink {
  const character =
    row.projection_world_id &&
    row.projection_actor_id &&
    row.projection_name &&
    row.level !== null &&
    row.health_max !== null &&
    row.damage !== null &&
    row.healing_rate !== null &&
    row.insanity !== null &&
    row.corruption !== null &&
    row.source_updated_at &&
    row.last_synced_at &&
    row.is_active !== null
      ? mapCharacter({
          world_id: row.projection_world_id,
          foundry_actor_id: row.projection_actor_id,
          name: row.projection_name,
          level: row.level,
          ancestry: row.ancestry,
          novice_path: row.novice_path,
          expert_path: row.expert_path,
          master_path: row.master_path,
          legendary_path: row.legendary_path,
          health_max: row.health_max,
          damage: row.damage,
          healing_rate: row.healing_rate,
          insanity: row.insanity,
          corruption: row.corruption,
          source_updated_at: row.source_updated_at,
          last_synced_at: row.last_synced_at,
          is_active: row.is_active,
        })
      : null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    worldId: row.world_id,
    actorId: row.foundry_actor_id,
    actorName: row.actor_name,
    createdAt: requiredIsoDateTime(row.created_at),
    updatedAt: requiredIsoDateTime(row.updated_at),
    character,
  };
}

function mapCharacter(row: CharacterRow): CampaignCharacterProjection {
  return {
    worldId: row.world_id,
    actorId: row.foundry_actor_id,
    name: row.name,
    level: row.level,
    ancestry: row.ancestry,
    paths: {
      novice: row.novice_path,
      expert: row.expert_path,
      master: row.master_path,
      legendary: row.legendary_path,
    },
    statistics: {
      healthMax: row.health_max,
      damage: row.damage,
      healingRate: row.healing_rate,
      insanity: row.insanity,
      corruption: row.corruption,
    },
    sourceUpdatedAt: requiredIsoDateTime(row.source_updated_at),
    lastSyncedAt: requiredIsoDateTime(row.last_synced_at),
    active: Boolean(row.is_active),
  };
}

function requiredIsoDateTime(value: string): string {
  return toIsoDateTime(value)!;
}
