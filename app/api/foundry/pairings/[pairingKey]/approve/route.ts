import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { approveFoundryPairing } from "@/server/integrations/foundry-worlds";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";

const ApprovalSchema = z.object({ campaignId: z.string().uuid() }).strict();
type RouteContext = Readonly<{ params: Promise<{ pairingKey: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const { pairingKey } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, ApprovalSchema);
    const parsedPairingId = z.string().uuid().safeParse(pairingKey);
    if (!parsedPairingId.success) {
      throw new HttpError(404, "pairing_not_found", "Solicitação não encontrada.");
    }
    return jsonResponse(
      await approveFoundryPairing(
        session,
        parsedPairingId.data,
        input.campaignId,
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}
