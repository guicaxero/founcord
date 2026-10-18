import { EntityIdSchema } from "@ordem/contracts";
import { getOptionalSession } from "@/server/identity/session";
import { getRavenImage } from "@/server/campaign/ravens";

export const dynamic = "force-dynamic";

type RouteContext = Readonly<{ params: Promise<{ ravenId: string }> }>;

/**
 * Imagem do Corvo: redireciona para a imagem enviada ao portal ou serve o
 * retrato que o Foundry sincronizou. O endereço leva a versão do retrato,
 * então o cache pode ser longo.
 */
export async function GET(request: Request, context: RouteContext) {
  const { ravenId } = await context.params;
  const notFound = () => new Response("Imagem não encontrada.", { status: 404, headers: { "cache-control": "no-store" } });
  if (!EntityIdSchema.safeParse(ravenId).success) return notFound();
  const image = await getRavenImage(ravenId, await getOptionalSession(request)).catch(() => null);
  if (!image) return notFound();
  if (image.kind === "redirect") {
    return new Response(null, { status: 302, headers: { location: image.location, "cache-control": "no-store" } });
  }
  return new Response(image.body, {
    headers: {
      "content-type": image.contentType,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
