import { requirePermission } from "@ordem/authz";
import {
  CharacterSheetSchema,
  PlayerCharacterSheetResponseSchema,
  type PlayerCharacterSheetResponse,
} from "@ordem/contracts";
import type { AuthenticatedSession } from "@/server/identity/session";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";

type SheetRow = Readonly<{
  campaign_id: string;
  world_id: string;
  foundry_actor_id: string;
  actor_name: string;
  projection_name: string | null;
  sheet_json: string | null;
  last_synced_at: string | null;
}>;

/** Personagem vinculado ao usuário na campanha, com a ficha projetada. */
export async function findOwnSheetRow(campaignId: string, userId: string): Promise<SheetRow | null> {
  return getD1()
    .prepare(
      `SELECT l.campaign_id, l.world_id, l.foundry_actor_id, l.actor_name,
              p.name AS projection_name, p.sheet_json, p.last_synced_at
       FROM campaign_character_links l
       INNER JOIN campaign_members cm
         ON cm.campaign_id = l.campaign_id AND cm.user_id = l.user_id AND cm.status = 'active'
       LEFT JOIN foundry_character_projections p
         ON p.campaign_id = l.campaign_id
        AND p.world_id = l.world_id
        AND p.foundry_actor_id = l.foundry_actor_id
        AND p.is_active = 1
       WHERE l.campaign_id = ? AND l.user_id = ?`,
    )
    .bind(campaignId, userId)
    .first<SheetRow>();
}

/**
 * Ficha completa do personagem do próprio usuário. Outros jogadores nunca a
 * recebem: a consulta parte sempre do vínculo da sessão.
 */
export async function getOwnCharacterSheet(
  session: AuthenticatedSession,
  campaignId: string,
): Promise<PlayerCharacterSheetResponse> {
  requirePermission(session.principal, "character:self:read", { kind: "campaign", campaignId });
  const row = await findOwnSheetRow(campaignId, session.user.id);
  if (!row) {
    throw new HttpError(404, "character_link_not_found", "Você ainda não tem um personagem vinculado nesta campanha.");
  }
  const parsed = row.sheet_json ? CharacterSheetSchema.safeParse(JSON.parse(row.sheet_json)) : null;
  return PlayerCharacterSheetResponseSchema.parse({
    campaignId: row.campaign_id,
    actorName: row.projection_name ?? row.actor_name,
    sheet: parsed?.success ? parsed.data : null,
    lastSyncedAt: toIsoDateTime(row.last_synced_at),
  });
}
