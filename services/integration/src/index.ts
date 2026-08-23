import { Hono } from "hono";
import {
  CreateDiscordPostDraftSchema,
  DiscordInteractionSchema,
  DiscordPostPublicationSchema,
  type DiscordInteraction,
  type DiscordPostPublication,
} from "@vigilia/contracts";
import {
  createForumThread,
  editOriginalInteraction,
  forumTagChoices,
  getForumChannel,
  registerGuildCommands,
  sendDirectMessage,
} from "./discord-client";
import {
  extractModalValues,
  POST_COMMAND_NAME,
  postModalResponse,
  postTargetFromModal,
} from "./discord-components";
import {
  createDiscordDraft,
  getPublishedPortalPost,
  notifyPortalOfDiscordPublication,
} from "./portal-client";
import {
  beginDiscordDelivery,
  claimDiscordInteraction,
  completeDiscordInteraction,
  completeDiscordPublication,
  failDiscordDelivery,
  failDiscordInteraction,
  getDiscordDeliveryAttempts,
  getDiscordPostLink,
  getDiscordPostTarget,
  type DiscordPostLink,
} from "./repository";
import type { IntegrationEnv, PublicationBatch } from "./types";
import { verifyDiscordRequest } from "./verify-discord-request";
import { verifyInternalRequest } from "./verify-internal-request";

const integrationApp = new Hono<{ Bindings: IntegrationEnv }>();

integrationApp.get("/health", (context) =>
  context.json({ service: "discord-integration", status: "ok" }),
);

integrationApp.get("/openapi.json", (context) =>
  context.json({
    openapi: "3.1.0",
    info: { title: "Ordem Discord Integration API", version: "0.3.0" },
    paths: {
      "/health": { get: { responses: { 200: { description: "Healthy" } } } },
      "/interactions": {
        post: { responses: { 200: { description: "Discord interaction response" } } },
      },
      "/internal/discord/register-commands": {
        post: {
          security: [{ internalBearer: [] }],
          responses: {
            200: { description: "Guild commands registered" },
            401: { description: "Unauthorized" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        internalBearer: { type: "http", scheme: "bearer" },
      },
    },
  }),
);

integrationApp.post("/internal/discord/register-commands", async (context) => {
  if (
    !(await verifyInternalRequest(
      context.req.raw,
      context.env.INTEGRATION_SERVICE_TOKEN,
    ))
  ) {
    return context.json({ error: "unauthorized" }, 401);
  }

  try {
    const commands = await registerGuildCommands(context.env);
    return context.json({
      scope: "guild",
      guildId: context.env.DISCORD_GUILD_ID,
      commands,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        code: "discord_command_registration_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    return context.json({ error: "discord_command_registration_failed" }, 502);
  }
});

integrationApp.post("/interactions", async (context) => {
  const body = await context.req.text();
  const valid = await verifyDiscordRequest(
    body,
    context.req.header("x-signature-ed25519") ?? null,
    context.req.header("x-signature-timestamp") ?? null,
    context.env.DISCORD_PUBLIC_KEY,
  );
  if (!valid) return context.json({ error: "invalid_request_signature" }, 401);

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return context.json({ error: "invalid_json" }, 400);
  }
  const parsed = DiscordInteractionSchema.safeParse(json);
  if (!parsed.success) return context.json({ error: "invalid_interaction" }, 400);
  const interaction = parsed.data;
  if (interaction.application_id !== context.env.DISCORD_APPLICATION_ID) {
    return context.json({ error: "invalid_application" }, 401);
  }

  if (interaction.type === 1) return context.json({ type: 1 });
  if (interaction.guild_id !== context.env.DISCORD_GUILD_ID) {
    return context.json({
      type: 4,
      data: { content: "Este servidor não está autorizado para a campanha.", flags: 64 },
    });
  }
  if (interaction.type === 4 && interaction.data?.name === POST_COMMAND_NAME) {
    const forumChannelId = forumChannelIdFromOption(interaction);
    if (!forumChannelId) return context.json({ type: 8, data: { choices: [] } });
    try {
      const forum = await getForumChannel(context.env, forumChannelId);
      if (forum.guildId !== context.env.DISCORD_GUILD_ID) {
        return context.json({ type: 8, data: { choices: [] } });
      }
      return context.json({
        type: 8,
        data: { choices: forumTagChoices(forum, focusedTagQuery(interaction)) },
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          code: "discord_forum_tag_autocomplete_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      return context.json({ type: 8, data: { choices: [] } });
    }
  }
  if (interaction.type === 2 && interaction.data?.name === POST_COMMAND_NAME) {
    const forumChannelId = forumChannelIdFromCommand(interaction);
    if (!forumChannelId) {
      return context.json({
        type: 4,
        data: {
          content: "Escolha um canal de fórum válido para publicar o post.",
          flags: 64,
        },
      });
    }
    try {
      const forum = await getForumChannel(context.env, forumChannelId);
      const forumTagId = forumTagIdFromCommand(interaction);
      if (forum.guildId !== context.env.DISCORD_GUILD_ID) {
        throw new Error("Forum belongs to another guild.");
      }
      if (forumTagId && !forum.tags.some((tag) => tag.id === forumTagId)) {
        return context.json({
          type: 4,
          data: { content: "Escolha uma tag válida desse fórum.", flags: 64 },
        });
      }
      if (forum.requiresTag && !forumTagId) {
        return context.json({
          type: 4,
          data: {
            content: "Esse fórum exige uma tag. Execute /post novamente e escolha uma tag.",
            flags: 64,
          },
        });
      }
      return context.json(postModalResponse(forumChannelId, forumTagId));
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          code: "discord_forum_validation_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      return context.json({
        type: 4,
        data: {
          content: "Não foi possível validar o fórum agora. Tente novamente.",
          flags: 64,
        },
      });
    }
  }
  const postTarget = postTargetFromModal(interaction.data?.custom_id);
  if (interaction.type === 5 && postTarget) {
    context.executionCtx.waitUntil(
      processPostModal(context.env, interaction, postTarget),
    );
    return context.json({ type: 5, data: { flags: 64 } });
  }
  return context.json({
    type: 4,
    data: { content: "Comando ainda não suportado.", flags: 64 },
  });
});

async function processPostModal(
  env: IntegrationEnv,
  interaction: DiscordInteraction,
  target: Readonly<{ forumChannelId: string; forumTagId: string | null }>,
): Promise<void> {
  const user = interaction.member?.user ?? interaction.user;
  const values = extractModalValues(interaction.data?.components);
  const input = CreateDiscordPostDraftSchema.safeParse({
    campaignId: env.DEFAULT_CAMPAIGN_ID,
    interactionId: interaction.id,
    discordUserId: user?.id,
    guildId: interaction.guild_id ?? null,
    channelId: interaction.channel_id ?? null,
    forumChannelId: target.forumChannelId,
    forumTagId: target.forumTagId,
    personaName: values.post_persona?.trim() || null,
    title: values.post_title,
    body: values.post_body,
  });
  if (!input.success || !input.data.guildId) {
    await editOriginalInteraction(
      env,
      interaction.application_id,
      interaction.token,
      { content: "Não foi possível validar os campos do post.", embeds: [] },
    );
    return;
  }

  const correlationId = crypto.randomUUID();
  try {
    const claim = await claimDiscordInteraction(env, interaction.id);
    if (claim.status !== "claimed") {
      await editOriginalInteraction(
        env,
        interaction.application_id,
        interaction.token,
        {
          content:
            claim.status === "succeeded"
              ? "Esse post já foi enviado para revisão."
              : claim.status === "failed"
                ? "Esse envio falhou após três tentativas. Procure a administração."
              : "Esse envio já está sendo processado.",
          components: dashboardButton(env),
        },
      );
      return;
    }

    const post = await createDiscordDraft(env, input.data, correlationId);
    await completeDiscordInteraction(env, interaction.id, post.id, {
      campaignId: post.campaignId,
      discordUserId: input.data.discordUserId,
      guildId: input.data.guildId,
      forumChannelId: input.data.forumChannelId,
      forumTagId: input.data.forumTagId,
    });
    await editOriginalInteraction(env, interaction.application_id, interaction.token, {
      content: "Post enviado para revisão humana no portal.",
      embeds: [
        {
          title: post.title,
          description: post.body.slice(0, 4_096),
          color: 0xb78a4a,
          footer: { text: "Status: aguardando revisão" },
        },
      ],
      components: dashboardButton(env),
      allowed_mentions: { parse: [] },
    });
  } catch (error) {
    await failDiscordInteraction(env, interaction.id, error).catch(() => undefined);
    await editOriginalInteraction(env, interaction.application_id, interaction.token, {
      content: error instanceof Error ? error.message : "Não foi possível criar o post.",
      embeds: [],
      allowed_mentions: { parse: [] },
    }).catch(() => undefined);
  }
}

function dashboardButton(env: IntegrationEnv) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "Abrir painel de revisão",
          url: `${env.SITE_URL}/dashboard`,
        },
      ],
    },
  ];
}

async function publishPost(
  env: IntegrationEnv,
  message: DiscordPostPublication,
): Promise<void> {
  const existingLink = await getDiscordPostLink(env, message.postId);
  if (existingLink) {
    await notifyPortalOfDiscordPublication(
      env,
      publicationNotification(existingLink),
      message.correlationId,
    );
    return;
  }
  if ((await beginDiscordDelivery(env, message.postId)) === "succeeded") {
    throw new Error("Discord delivery succeeded without a persisted thread link.");
  }
  let linkPersisted = false;
  try {
    const post = await getPublishedPortalPost(
      env,
      message.postId,
      message.correlationId,
    );
    const target = await getDiscordPostTarget(env, post.id);
    const thread = await createForumThread(
      env,
      post,
      target.forumChannelId,
      target.forumTagId,
    );
    const publishedAt = new Date().toISOString();
    await completeDiscordPublication(
      env,
      post,
      thread,
      target,
      publishedAt,
    );
    linkPersisted = true;
    await notifyPortalOfDiscordPublication(
      env,
      {
        postId: post.id,
        campaignId: post.campaignId,
        guildId: target.guildId,
        forumChannelId: target.forumChannelId,
        forumTagId: target.forumTagId,
        threadId: thread.id,
        starterMessageId: thread.messageId,
        publishedAt,
      },
      message.correlationId,
    );
    await notifyPublicationSuccess(env, post, target, thread.id).catch((error) =>
      logNotificationFailure(post.id, error),
    );
  } catch (error) {
    if (!linkPersisted) {
      await failDiscordDelivery(env, message.postId, error).catch(() => undefined);
    }
    throw error;
  }
}

function publicationNotification(link: DiscordPostLink) {
  return {
    postId: link.postId,
    campaignId: link.campaignId,
    guildId: link.guildId,
    forumChannelId: link.forumChannelId,
    forumTagId: link.forumTagId,
    threadId: link.threadId,
    starterMessageId: link.starterMessageId,
    publishedAt: link.publishedAt,
  };
}

export async function handlePublicationBatch(
  batch: PublicationBatch,
  env: IntegrationEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = DiscordPostPublicationSchema.safeParse(message.body);
    if (!parsed.success) {
      console.error(JSON.stringify({ level: "error", code: "invalid_queue_message" }));
      message.ack();
      continue;
    }
    try {
      await publishPost(env, parsed.data);
      message.ack();
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          code: "discord_publication_failed",
          postId: parsed.data.postId,
          correlationId: parsed.data.correlationId,
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      if ((await getDiscordDeliveryAttempts(env, parsed.data.postId)) >= 6) {
        await notifyPublicationFailure(env, parsed.data, error).catch(
          (notificationError) =>
            logNotificationFailure(parsed.data.postId, notificationError),
        );
      }
      message.retry();
    }
  }
}

const integrationWorker: ExportedHandler<IntegrationEnv, DiscordPostPublication> = {
  fetch(request, env, executionContext) {
    return integrationApp.fetch(request, env, executionContext);
  },
  queue(batch, env) {
    return handlePublicationBatch(batch, env);
  },
};

export { integrationApp, processPostModal, publishPost };
export default integrationWorker;

function forumChannelIdFromCommand(
  interaction: DiscordInteraction,
): string | null {
  const option = interaction.data?.options?.find(
    (candidate) => candidate.name === "forum" && candidate.type === 7,
  );
  if (!option || typeof option.value !== "string") return null;
  const channel = interaction.data?.resolved?.channels?.[option.value];
  if (!channel || channel.id !== option.value || channel.type !== 15) return null;
  return option.value;
}

function forumChannelIdFromOption(interaction: DiscordInteraction): string | null {
  const option = interaction.data?.options?.find(
    (candidate) => candidate.name === "forum" && candidate.type === 7,
  );
  return option && typeof option.value === "string" ? option.value : null;
}

function forumTagIdFromCommand(interaction: DiscordInteraction): string | null {
  const option = interaction.data?.options?.find(
    (candidate) => candidate.name === "tag" && candidate.type === 3,
  );
  return option && typeof option.value === "string" ? option.value : null;
}

function focusedTagQuery(interaction: DiscordInteraction): string {
  const option = interaction.data?.options?.find(
    (candidate) =>
      candidate.name === "tag" && candidate.type === 3 && candidate.focused,
  );
  return option && typeof option.value === "string" ? option.value : "";
}

async function notifyPublicationSuccess(
  env: IntegrationEnv,
  post: Readonly<{ id: string; title: string }>,
  target: Readonly<{ discordUserId: string; guildId: string }>,
  threadId: string,
): Promise<void> {
  await sendDirectMessage(env, target.discordUserId, {
    content: `✅ Seu post **${post.title}** foi publicado no Discord.\nhttps://discord.com/channels/${target.guildId}/${threadId}`,
    allowed_mentions: { parse: [] },
  });
}

async function notifyPublicationFailure(
  env: IntegrationEnv,
  message: DiscordPostPublication,
  error: unknown,
): Promise<void> {
  const [post, target] = await Promise.all([
    getPublishedPortalPost(env, message.postId, message.correlationId),
    getDiscordPostTarget(env, message.postId),
  ]);
  await sendDirectMessage(env, target.discordUserId, {
    content:
      `⚠️ Não foi possível publicar **${post.title}** no fórum do Discord após várias tentativas. ` +
      `O conteúdo continua preservado no portal. Referência: \`${message.correlationId}\`.`,
    allowed_mentions: { parse: [] },
  });
  console.error(
    JSON.stringify({
      level: "error",
      code: "discord_publication_exhausted",
      postId: message.postId,
      correlationId: message.correlationId,
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
}

function logNotificationFailure(postId: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      code: "discord_delivery_notification_failed",
      postId,
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
}
