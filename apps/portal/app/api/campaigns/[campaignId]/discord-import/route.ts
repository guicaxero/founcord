import { DiscordImportInputSchema, DiscordImportResultSchema } from "@ordem/contracts";
import { importDiscordThreads } from "@/server/campaign/discord-import";
import { requireSession } from "@/server/identity/session";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Importa tópicos do Discord como crônicas, com as imagens copiadas para o portal. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      DiscordImportResultSchema.parse(
        await importDiscordThreads(
          await requireSession(request),
          campaignId,
          await parseJson(request, DiscordImportInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
