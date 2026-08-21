import { AddCampaignMemberSchema } from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import { addMember, listMembers } from "@/server/domain/campaigns";
import {
  assertSameOrigin,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      { data: await listMembers(await requireSession(request), campaignId) },
      {},
      correlationId,
    ),
  )(request);
}

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, AddCampaignMemberSchema);
    return jsonResponse(
      await addMember(
        session,
        campaignId,
        input,
        correlationId,
      ),
      { status: 201 },
      correlationId,
    );
  })(request);
}
