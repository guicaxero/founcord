import { requirePermission } from "@ordem/authz";
import {
  DiscordForumDetailSchema,
  DiscordForumListResponseSchema,
  MissionDiscordPublishResultSchema,
  type MissionDiscordPublishInput,
  type MissionDiscordView,
  type MissionSummary,
} from "@ordem/contracts";
import type { AuthenticatedSession } from "@/server/identity/session";
import { getMediaBucket } from "@/server/media/media";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { discordWorker } from "./discord-import";
import { getMission } from "./missions";

/** Nome do fórum onde a Ordem registra as missões; vem escolhido. */
const MISSIONS_FORUM = "registros-das-missoes";

function forumKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/gu, "-");
}

async function requirePublishableMission(
  session: AuthenticatedSession,
  campaignId: string,
  missionId: string,
): Promise<MissionSummary> {
  requirePermission(session.principal, "mission:publish", { kind: "campaign", campaignId });
  const mission = await getMission(missionId, session);
  if (mission.campaignId !== campaignId) throw new HttpError(404, "mission_not_found", "Missão não encontrada.");
  return mission;
}

function threadUrl(guildId: string, threadId: string | null): string | null {
  return threadId ? `https://discord.com/channels/${guildId}/${threadId}` : null;
}

/** Fóruns do servidor, o fórum escolhido (registros-das-missões por padrão) e as tags dele. */
export async function getMissionDiscordView(
  session: AuthenticatedSession,
  campaignId: string,
  missionId: string,
  forumId: string | null,
  correlationId: string,
): Promise<MissionDiscordView> {
  const mission = await requirePublishableMission(session, campaignId, missionId);
  const forums = (await discordWorker("/internal/discord/forums", DiscordForumListResponseSchema, correlationId)).data;
  const chosen =
    forums.find((candidate) => candidate.id === forumId) ??
    forums.find((candidate) => forumKey(candidate.name).includes(MISSIONS_FORUM)) ??
    forums[0] ??
    null;
  const forum = chosen
    ? await discordWorker(`/internal/discord/forums/${encodeURIComponent(chosen.id)}`, DiscordForumDetailSchema, correlationId)
    : null;
  return { forums, forum, threadUrl: forum ? threadUrl(forum.guildId, mission.discordThreadId) : null };
}

/** Lê a capa do armazenamento para anexar ao tópico. */
async function coverAttachment(campaignId: string, mediaId: string | null) {
  if (!mediaId) return null;
  const row = await getD1()
    .prepare("SELECT r2_key, content_type FROM media_assets WHERE id = ? AND campaign_id = ?")
    .bind(mediaId, campaignId)
    .first<{ r2_key: string; content_type: "image/webp" | "image/png" | "image/jpeg" | "image/gif" }>();
  if (!row) return null;
  const object = await getMediaBucket().get(row.r2_key);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const extension = row.r2_key.split(".").pop() ?? "png";
  return { base64: btoa(binary), filename: `capa.${extension}`, contentType: row.content_type };
}

/**
 * Cria o tópico da missão no fórum do Discord, uma vez só, com a capa e as
 * tags. A missão precisa estar publicada no portal.
 */
export async function publishMissionToDiscord(
  session: AuthenticatedSession,
  campaignId: string,
  missionId: string,
  input: MissionDiscordPublishInput,
  correlationId: string,
): Promise<MissionSummary> {
  const mission = await requirePublishableMission(session, campaignId, missionId);
  if (mission.status !== "published") {
    throw new HttpError(409, "mission_not_published", "Publique a missão no portal antes de levá-la ao Discord.");
  }
  if (mission.discordThreadId) {
    throw new HttpError(409, "mission_already_on_discord", "Esta missão já foi publicada no Discord.");
  }
  const result = await discordWorker(
    "/internal/discord/missions/publish",
    MissionDiscordPublishResultSchema,
    correlationId,
    {
      ...input,
      missionId,
      title: mission.title.slice(0, 100),
      image: await coverAttachment(campaignId, mission.coverMediaId),
    },
  );
  const db = getD1();
  await db.batch([
    db
      .prepare(
        `UPDATE missions SET discord_thread_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND discord_thread_id IS NULL`,
      )
      .bind(result.threadId, missionId),
    prepareAudit(db, {
      actorUserId: session.user.id,
      campaignId,
      action: "mission.discord_published",
      entityType: "mission",
      entityId: missionId,
      correlationId,
      details: { threadId: result.threadId, forumChannelId: input.forumChannelId, tags: input.tagIds.length },
    }),
  ]);
  return getMission(missionId, session);
}
