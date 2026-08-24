import { FoundryUserCodeSchema } from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import { getFoundryPairingView } from "@/server/integrations/foundry-worlds";
import { HttpError, jsonResponse, withApiHandler } from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ pairingKey: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { pairingKey } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    const parsed = FoundryUserCodeSchema.safeParse(pairingKey);
    if (!parsed.success) {
      throw new HttpError(
        404,
        "pairing_not_found",
        "Não encontramos uma solicitação ativa para este código.",
      );
    }
    const session = await requireSession(request);
    return jsonResponse(
      await getFoundryPairingView(session, parsed.data, correlationId),
      {},
      correlationId,
    );
  })(request);
}
