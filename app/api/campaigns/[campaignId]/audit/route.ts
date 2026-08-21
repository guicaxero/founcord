import { requireSession } from "@/server/auth/session";
import { listAuditEntries } from "@/server/domain/audit-log";
import { jsonResponse, withApiHandler } from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      {
        data: await listAuditEntries(
          await requireSession(request),
          campaignId,
          Number(new URL(request.url).searchParams.get("limit") ?? 100),
        ),
      },
      {},
      correlationId,
    ),
  )(request);
}
