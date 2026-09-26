import { CompendiumEntrySchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import { getCompendiumEntry } from "@/server/creatures/compendium";
import { jsonResponse, withApiHandler } from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string; entryId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId, entryId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      CompendiumEntrySchema.parse(await getCompendiumEntry(await requireSession(request), campaignId, entryId)),
      {},
      correlationId,
    ),
  )(request);
}
