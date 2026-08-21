import { UpdatePostSchema } from "@vigilia/contracts";
import { requireSession } from "@/server/auth/session";
import { archivePost, updatePost } from "@/server/domain/posts";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/http";

type RouteContext = Readonly<{ params: Promise<{ postId: string }> }>;

export async function PATCH(request: Request, context: RouteContext) {
  const { postId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, UpdatePostSchema);
    return jsonResponse(
      await updatePost(
        session,
        postId,
        input,
        correlationId,
      ),
      {},
      correlationId,
    );
  })(request);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { postId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!Number.isInteger(version) || version < 1) {
      throw new HttpError(422, "invalid_version", "Informe a versão do post.");
    }
    await archivePost(
      await requireSession(request),
      postId,
      version,
      correlationId,
    );
    return new Response(null, { status: 204 });
  })(request);
}
