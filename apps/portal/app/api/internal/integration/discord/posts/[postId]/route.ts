import { getPublishedPostForIntegration } from "@/server/campaign/posts";
import { jsonResponse, withApiHandler } from "@/server/shared/http";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";

export const dynamic = "force-dynamic";

type RouteContext = Readonly<{ params: Promise<{ postId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { postId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    await assertIntegrationServiceRequest(request);
    return jsonResponse(
      { post: await getPublishedPostForIntegration(postId) },
      {},
      correlationId,
    );
  })(request);
}
