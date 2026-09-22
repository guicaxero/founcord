import { UpdatePostSchema } from "@ordem/contracts";
import { requireSession } from "@/server/identity/session";
import {
  archivePost,
  deletePostPermanently,
  updatePost,
} from "@/server/campaign/posts";
import { enqueueDiscordPublication } from "@/server/integrations/discord-publications";
import {
  assertSameOrigin,
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";

type RouteContext = Readonly<{ params: Promise<{ postId: string }> }>;

export async function PATCH(request: Request, context: RouteContext) {
  const { postId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = await parseJson(request, UpdatePostSchema);
    const post = await updatePost(
      session,
      postId,
      input,
      correlationId,
    );
    if (post.status === "published" && post.source === "discord") {
      enqueueDiscordPublication(post, correlationId);
    }
    return jsonResponse(post, {}, correlationId);
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
    const session = await requireSession(request);
    if (new URL(request.url).searchParams.get("mode") === "permanent") {
      await deletePostPermanently(session, postId, version, correlationId);
    } else {
      await archivePost(session, postId, version, correlationId);
    }
    return new Response(null, { status: 204 });
  })(request);
}
