import { MediaAssetSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { uploadMedia } from "@/server/media/media";
import { assertSameOrigin, jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Envio de imagem (capa ou galeria), em multipart com o campo `file`. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      MediaAssetSchema.parse(await uploadMedia(await requireSession(request), campaignId, request, correlationId)),
      { status: 201 },
      correlationId,
    );
  })(request);
}
