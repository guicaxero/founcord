import { EntityIdSchema } from "@ordem/contracts";
import { readMedia } from "@/server/media/media";

export const dynamic = "force-dynamic";

type RouteContext = Readonly<{ params: Promise<{ mediaId: string }> }>;

/** Imagem enviada ao portal; o endereço não muda, então o cache é longo. */
export async function GET(_request: Request, context: RouteContext) {
  const { mediaId } = await context.params;
  const notFound = () => new Response("Imagem não encontrada.", { status: 404, headers: { "cache-control": "no-store" } });
  if (!EntityIdSchema.safeParse(mediaId).success) return notFound();
  const media = await readMedia(mediaId).catch(() => null);
  if (!media) return notFound();
  return new Response(media.body, {
    headers: {
      "content-type": media.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      etag: media.etag,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
