import { CreateDiscordPostDraftSchema } from "@ordem/contracts";
import { getSessionForDiscordUser } from "@/server/identity/session";
import { createPost, updatePost } from "@/server/campaign/posts";
import {
  HttpError,
  jsonResponse,
  parseJson,
  withApiHandler,
} from "@/server/shared/http";
import { assertIntegrationServiceRequest } from "@/server/integrations/service-auth";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(async ({ request, correlationId }) => {
  await assertIntegrationServiceRequest(request);
  const input = await parseJson(request, CreateDiscordPostDraftSchema);
  const session = await getSessionForDiscordUser(input.discordUserId);
  if (!session) {
    throw new HttpError(
      403,
      "discord_identity_not_linked",
      "Entre no portal com o Discord antes de criar um post.",
    );
  }

  const draft = await createPost(
    session,
    {
      campaignId: input.campaignId,
      title: input.title,
      body: input.body,
      source: "discord",
      coverMediaId: null,
      galleryMediaIds: [],
      tags: [],
      // O nome narrativo do /post vira a assinatura da crônica.
      byline: input.personaName ?? null,
    },
    correlationId,
  );
  const pendingReview = await updatePost(
    session,
    draft.id,
    { version: draft.version, status: "pending_review" },
    correlationId,
  );

  return jsonResponse({ post: pendingReview }, { status: 201 }, correlationId);
});
