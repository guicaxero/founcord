import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hasPermission } from "@ordem/authz";
import {
  MEDIA_MAX_BYTES,
  MediaAssetSchema,
  detectImageType,
  mediaUrl,
  type MediaAsset,
  type MediaContentType,
} from "@ordem/contracts";
import type { AuthenticatedSession } from "@/server/identity/session";
import { prepareAudit } from "@/server/shared/audit";
import { getD1 } from "@/server/shared/db";
import { HttpError } from "@/server/shared/http";
import { toIsoDateTime } from "@/server/shared/time";

type MediaRow = Readonly<{
  id: string;
  campaign_id: string;
  r2_key: string;
  content_type: MediaContentType;
  bytes: number;
  created_at: string;
}>;

const EXTENSIONS: Readonly<Record<MediaContentType, string>> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
};

/** Quem escreve crônicas ou monta missões pode enviar imagens. */
const UPLOAD_PERMISSIONS = ["post:create", "mission:create", "mission:edit"] as const;

export function getMediaBucket(): R2Bucket {
  const { env } = getCloudflareContext();
  if (!env.MEDIA) {
    throw new HttpError(503, "media_not_configured", "O armazenamento de imagens ainda não está configurado.");
  }
  return env.MEDIA;
}

function mapMedia(row: MediaRow): MediaAsset {
  return MediaAssetSchema.parse({
    id: row.id,
    campaignId: row.campaign_id,
    url: mediaUrl(row.id),
    contentType: row.content_type,
    bytes: row.bytes,
    createdAt: toIsoDateTime(row.created_at),
  });
}

/**
 * Grava a imagem no R2 e registra no banco. Confere o tipo pelos primeiros
 * bytes e o tamanho; usado pelo envio no painel e pela importação do Discord.
 */
export async function storeMedia(
  campaignId: string,
  data: ArrayBuffer,
  origin: "upload" | "discord",
  createdByUserId: string | null,
): Promise<MediaAsset> {
  if (data.byteLength === 0) throw new HttpError(422, "media_empty", "O arquivo está vazio.");
  if (data.byteLength > MEDIA_MAX_BYTES) {
    throw new HttpError(413, "media_too_large", "A imagem passa de 8 MB. Reduza o tamanho e envie de novo.");
  }
  const contentType = detectImageType(new Uint8Array(data.slice(0, 16)));
  if (!contentType) {
    throw new HttpError(415, "media_unsupported", "Envie uma imagem WebP, PNG, JPEG ou GIF.");
  }
  const id = crypto.randomUUID();
  const key = `campaigns/${campaignId}/${id}.${EXTENSIONS[contentType]}`;
  await getMediaBucket().put(key, data, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
  await getD1()
    .prepare(
      `INSERT INTO media_assets (id, campaign_id, created_by_user_id, r2_key, content_type, bytes, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, campaignId, createdByUserId, key, contentType, data.byteLength, origin)
    .run();
  const row = await getD1().prepare("SELECT * FROM media_assets WHERE id = ?").bind(id).first<MediaRow>();
  return mapMedia(row!);
}

/** Envio de imagem pelo painel (multipart, campo `file`). */
export async function uploadMedia(
  session: AuthenticatedSession,
  campaignId: string,
  request: Request,
  correlationId: string,
): Promise<MediaAsset> {
  const scope = { kind: "campaign" as const, campaignId };
  if (!UPLOAD_PERMISSIONS.some((permission) => hasPermission(session.principal, permission, scope))) {
    throw new HttpError(403, "forbidden", "Você não pode enviar imagens nesta campanha.");
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MEDIA_MAX_BYTES + 64 * 1024) {
    throw new HttpError(413, "media_too_large", "A imagem passa de 8 MB. Reduza o tamanho e envie de novo.");
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    throw new HttpError(422, "media_invalid", "Não foi possível ler o arquivo enviado.");
  }
  if (!file || typeof file === "string") throw new HttpError(422, "media_missing", "Escolha uma imagem.");
  const asset = await storeMedia(campaignId, await file.arrayBuffer(), "upload", session.user.id);
  await prepareAudit(getD1(), {
    actorUserId: session.user.id,
    campaignId,
    action: "media.uploaded",
    entityType: "media_asset",
    entityId: asset.id,
    correlationId,
    details: { contentType: asset.contentType, bytes: asset.bytes },
  }).run();
  return asset;
}

/** Garante que as imagens existem e são da campanha antes de ligá-las a um texto. */
export async function assertCampaignMedia(campaignId: string, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await getD1()
    .prepare(
      `SELECT COUNT(*) AS total FROM media_assets
       WHERE campaign_id = ? AND id IN (${unique.map(() => "?").join(", ")})`,
    )
    .bind(campaignId, ...unique)
    .first<{ total: number }>();
  if ((found?.total ?? 0) !== unique.length) {
    throw new HttpError(422, "media_not_found", "Uma das imagens não foi encontrada. Envie a imagem de novo.");
  }
}

/** Arquivo da imagem, para servir em `/media/<id>`. */
export async function readMedia(mediaId: string): Promise<Readonly<{ body: ReadableStream; contentType: string; etag: string }> | null> {
  const row = await getD1()
    .prepare("SELECT r2_key, content_type FROM media_assets WHERE id = ?")
    .bind(mediaId)
    .first<Pick<MediaRow, "r2_key" | "content_type">>();
  if (!row) return null;
  const object = await getMediaBucket().get(row.r2_key);
  if (!object) return null;
  return { body: object.body, contentType: row.content_type, etag: object.httpEtag };
}
