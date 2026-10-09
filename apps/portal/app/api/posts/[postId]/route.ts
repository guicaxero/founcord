import { UpdatePostSchema } from "@ordem/contracts";
import { getOptionalSession, requireSession } from "@/server/identity/session";
import {
  archivePost,
  deletePostPermanently,
  listPosts,
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
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

type RouteContext = Readonly<{ params: Promise<{ postId: string }> }>;

/**
 * Publicação avulsa, usada pela página de detalhe. A visibilidade é a mesma da
 * listagem: o público vê apenas publicações publicadas.
 */
export async function GET(request: Request, context: RouteContext) {
  const { postId } = await context.params;
  return withApiHandler(async ({ correlationId }) => {
    const session = await getOptionalSession(request);
    const campaignId = new URL(request.url).searchParams.get("campaignId") ?? DEFAULT_CAMPAIGN_ID;
    const post = (await listPosts(campaignId, session, true)).find((item) => item.id === postId);
    if (!post) {
      throw new HttpError(404, "post_not_found", "Publicação não encontrada.");
    }
    return jsonResponse(post, {}, correlationId);
  })(request);
}

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
    // Crônicas importadas do Discord já têm o tópico lá: não são republicadas.
    if (post.status === "published" && post.source === "discord" && !post.discordThreadId) {
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
