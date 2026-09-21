import { CreatePostSchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import { createPost, listPosts } from "@/server/campaign/posts";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ campaignId: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  return withApiHandler(async ({ correlationId }) =>
    jsonResponse(
      {
        data: await listPosts(
          campaignId,
          await getOptionalSession(request),
          new URL(request.url).searchParams.get("scope") === "editorial",
        ),
      },
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
    const input = await parseJson(request, CreatePostSchema);
    if (input.campaignId !== campaignId) {
      throw new HttpError(422, "campaign_mismatch", "A campanha informada é inválida.");
    }
    return jsonResponse(
      await createPost(session, input, correlationId),
      { status: 201 },
      correlationId,
    );
  })(request);
}
