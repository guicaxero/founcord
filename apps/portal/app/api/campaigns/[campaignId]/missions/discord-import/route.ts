import { MissionDiscordImportInputSchema, MissionDiscordImportResultSchema } from "@ordem/contracts";
import { importMissionThreads } from "@/server/campaign/discord-import";
import { requireSession } from "@/server/identity/session";
import { assertSameOrigin, jsonResponse, parseJson, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Importa tópicos do fórum de registros como missões já no registro. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    return jsonResponse(
      MissionDiscordImportResultSchema.parse(
        await importMissionThreads(
          await requireSession(request),
          campaignId,
          await parseJson(request, MissionDiscordImportInputSchema),
          correlationId,
        ),
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
