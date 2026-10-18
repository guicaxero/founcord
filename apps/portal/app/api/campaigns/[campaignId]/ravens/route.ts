import { CreateRavenSchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import { createRaven, listRavens } from "@/server/campaign/ravens";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

/** Registro dos Corvos público: só os Corvos marcados para aparecer. */
export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      { data: await listRavens(campaignId, await getOptionalSession(request)) },
      {},
      correlationId,
    ),
  )(request);
}

/** Corvo avulso, sem personagem no Foundry. */
export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, CreateRavenSchema);
    if (input.campaignId !== campaignId) {
      throw new HttpError(422, "campaign_mismatch", "A campanha informada é inválida.");
    }
    return jsonResponse(await createRaven(session, input, correlationId), { status: 201 }, correlationId);
  })(request);
}
