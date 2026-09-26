import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, test } from "vitest";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

// Respostas JSON dinâmicas: as asserções validam a forma em tempo de execução.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type TestDatabase = Awaited<ReturnType<Miniflare["getD1Database"]>>;
type ApiOptions = Readonly<{
  token?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}>;

const portalRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsRoot = join(portalRoot, "..", "..", "packages", "database", "portal", "migrations");
const origin = "http://localhost:8787";
const defaultCampaignId = "11111111-1111-4111-8111-111111111111";

const identities = {
  owner: user("10000000-0000-4000-8000-000000000001", "owner", "owner"),
  gm: user("20000000-0000-4000-8000-000000000002", "gm", "gm"),
  moderator: user("30000000-0000-4000-8000-000000000003", "moderator", "moderator"),
  automation: {
    ...user("40000000-0000-4000-8000-000000000004", "automation", "automation"),
    discordId: "400000000000000004",
  },
  playerOne: user("50000000-0000-4000-8000-000000000005", "player-one", "player"),
  playerTwo: user("60000000-0000-4000-8000-000000000006", "player-two", "player"),
  manager: user("70000000-0000-4000-8000-000000000007", "manager", "campaign_manager"),
  invitee: user("80000000-0000-4000-8000-000000000008", "invitee", null),
  privilegedInvitee: user("90000000-0000-4000-8000-000000000009", "privileged-invitee", null),
};

describe.sequential("Marco 1: autenticação, RBAC, campanha, missões, posts e auditoria", () => {
  const serverRoot = join(portalRoot, ".wrangler", "bundle");
  let mf: Miniflare;
  let db: TestDatabase;

  beforeAll(async () => {
    mf = new Miniflare(convertV4MiniflareOptions({
      modules: [{ type: "ESModule", path: join(serverRoot, "worker.js") }],
      modulesRoot: serverRoot,
      compatibilityDate: "2026-08-21",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: ["DB"],
      bindings: {
        DISCORD_CLIENT_ID: "test-client-id",
        DISCORD_CLIENT_SECRET: "test-client-secret",
        DISCORD_REDIRECT_URI: `${origin}/api/auth/discord/callback`,
        SESSION_SECRET: "test-session-secret-with-at-least-32-bytes",
        INTEGRATION_SERVICE_TOKEN: "test-integration-token-with-at-least-32-bytes",
      },
      serviceBindings: {
        ASSETS: async () => new Response("Not found", { status: 404 }),
      },
    }));
    db = await mf.getD1Database("DB");
    await applyMigrations(db);
    await seedDatabase(db);
  });

  afterAll(() => mf.dispose());

  {

    test("inicia OAuth Discord com state, PKCE e cookie", async () => {
      const response = await mf.dispatchFetch(
        `${origin}/api/auth/discord?returnTo=/dashboard`,
        { redirect: "manual" },
      );
      assert.equal(response.status, 302);
      const location = new URL(response.headers.get("location") ?? "");
      assert.equal(location.origin, "https://discord.com");
      assert.ok(location.searchParams.get("state"));
      assert.ok(location.searchParams.get("code_challenge"));
      assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
    });

    test("protege campanhas privadas e permite membros ativos", async () => {
      const anonymousCampaigns = await api(mf, "/api/campaigns");
      assert.equal(anonymousCampaigns.status, 200);
      assert.equal(
        anonymousCampaigns.data.data.some((item: Json) => item.id === privateCampaign.id),
        false,
      );

      for (const path of [
        `/api/campaigns/${privateCampaign.id}`,
        `/api/campaigns/${privateCampaign.id}/missions`,
        `/api/campaigns/${privateCampaign.id}/posts`,
        `/api/campaigns/${privateCampaign.id}/session-summaries`,
      ]) {
        assert.equal((await api(mf, path)).status, 404);
        assert.equal((await api(mf, path, { token: identities.playerOne.token })).status, 200);
      }
    });

    test("remove permissões efetivas ao suspender um membro", async () => {
      const before = await api(mf, "/api/me", { token: identities.gm.token });
      assert.equal(hasCapability(before.data, "mission:create"), true);

      const suspended = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/members/${identities.gm.id}`,
        {
          token: identities.owner.token,
          method: "PATCH",
          body: { status: "suspended" },
        },
      );
      assert.equal(suspended.status, 200, JSON.stringify(suspended.data));

      const after = await api(mf, "/api/me", { token: identities.gm.token });
      assert.equal(hasCapability(after.data, "mission:create"), false);
      const denied = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/missions`,
        {
          token: identities.gm.token,
          method: "POST",
          body: missionInput("Não deve ser criada"),
        },
      );
      assert.equal(denied.status, 403);

      const reactivated = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/members/${identities.gm.id}`,
        {
          token: identities.owner.token,
          method: "PATCH",
          body: { status: "active" },
        },
      );
      assert.equal(reactivated.status, 200);
    });

    test("permite ao gestor adicionar jogador, mas não atribuir privilégio", async () => {
      const player = await api(mf, `/api/campaigns/${defaultCampaignId}/members`, {
        token: identities.manager.token,
        method: "POST",
        body: { discordUserId: identities.invitee.discordId, role: "player" },
      });
      assert.equal(player.status, 201);

      const privileged = await api(mf, `/api/campaigns/${defaultCampaignId}/members`, {
        token: identities.manager.token,
        method: "POST",
        body: {
          discordUserId: identities.privilegedInvitee.discordId,
          role: "gm",
        },
      });
      assert.equal(privileged.status, 403);
    });

    test("executa o fluxo completo de missão e promove a lista de espera", async () => {
      const created = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`, {
        token: identities.gm.token,
        method: "POST",
        body: missionInput("A torre partida"),
      });
      assert.equal(created.status, 201);
      assert.equal(created.data.status, "draft");

      const pending = await transitionMission(mf, created.data, "pending_review", identities.gm.token);
      const approved = await transitionMission(mf, pending, "approved", identities.owner.token);
      const published = await transitionMission(mf, approved, "published", identities.owner.token);

      const first = await api(mf, `/api/missions/${published.id}/signups`, {
        token: identities.playerOne.token,
        method: "POST",
      });
      const second = await api(mf, `/api/missions/${published.id}/signups`, {
        token: identities.playerTwo.token,
        method: "POST",
      });
      assert.equal(first.data.status, "confirmed");
      assert.equal(second.data.status, "waitlisted");

      const withdrawal = await api(mf, `/api/missions/${published.id}/signups`, {
        token: identities.playerOne.token,
        method: "DELETE",
      });
      assert.equal(withdrawal.status, 204);

      const signups = await api(mf, `/api/missions/${published.id}/signups`, {
        token: identities.owner.token,
      });
      assert.deepEqual(
        signups.data.data.map((signup: Json) => [signup.userId, signup.status]),
        [[identities.playerTwo.id, "confirmed"]],
      );
    });

    test("obriga revisão humana no fluxo de posts", async () => {
      const created = await api(mf, `/api/campaigns/${defaultCampaignId}/posts`, {
        token: identities.automation.token,
        method: "POST",
        body: {
          campaignId: defaultCampaignId,
          title: "Relato extraído automaticamente",
          body: "Rascunho preparado para a mesa de revisão.",
          source: "automation",
        },
      });
      assert.equal(created.status, 201);

      const pending = await transitionPost(
        mf,
        created.data,
        "pending_review",
        identities.automation.token,
      );
      const automationApproval = await transitionPost(
        mf,
        pending,
        "approved",
        identities.automation.token,
      );
      assert.equal(automationApproval.status, 403);

      const approved = await transitionPost(mf, pending, "approved", identities.owner.token);
      const published = await transitionPost(mf, approved, "published", identities.owner.token);
      assert.equal(published.status, "published");

      const repeatedState = await api(mf, `/api/posts/${published.id}`, {
        token: identities.playerOne.token,
        method: "PATCH",
        body: { version: published.version, status: "published" },
      });
      assert.equal(repeatedState.status, 403);

      const tamper = await api(mf, `/api/posts/${published.id}`, {
        token: identities.playerOne.token,
        method: "PATCH",
        body: {
          version: published.version,
          status: "published",
          title: "Alteração indevida",
        },
      });
      assert.equal(tamper.status, 403);

      const publicPosts = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/posts`,
      );
      const visible = publicPosts.data.data.find((post: Json) => post.id === published.id);
      assert.equal(visible.title, "Relato extraído automaticamente");
    });

    test("separa resumos de sessão e protege seu ciclo editorial", async () => {
      const created = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/session-summaries`,
        {
          token: identities.owner.token,
          method: "POST",
          body: {
            campaignId: defaultCampaignId,
            sessionId: null,
            title: "O retorno da estrada cinzenta",
            body: "A expedição retornou antes que a névoa fechasse a passagem.",
            status: "published",
          },
        },
      );
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.status, "draft");

      const publicDrafts = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/session-summaries`,
      );
      assert.equal(publicDrafts.data.data.some((item: Json) => item.id === created.data.id), false);

      const directPublish = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/session-summaries/${created.data.id}`,
        {
          token: identities.owner.token,
          method: "PATCH",
          body: { version: created.data.version, status: "published" },
        },
      );
      assert.equal(directPublish.status, 409);

      const playerReview = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/session-summaries/${created.data.id}`,
        {
          token: identities.playerOne.token,
          method: "PATCH",
          body: { version: created.data.version, status: "pending_review" },
        },
      );
      assert.equal(playerReview.status, 403);

      const pending = await transitionSummary(mf, created.data, "pending_review", identities.owner.token);
      const published = await transitionSummary(mf, pending, "published", identities.owner.token);
      assert.equal(published.status, "published");

      const editPublished = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/session-summaries/${published.id}`,
        {
          token: identities.owner.token,
          method: "PATCH",
          body: { version: published.version, title: "Alteração sem restauração" },
        },
      );
      assert.equal(editPublished.status, 409);

      const [publicSummaries, publicPosts] = await Promise.all([
        api(mf, `/api/campaigns/${defaultCampaignId}/session-summaries`),
        api(mf, `/api/campaigns/${defaultCampaignId}/posts`),
      ]);
      assert.equal(publicSummaries.data.data.some((item: Json) => item.id === published.id), true);
      assert.equal(publicPosts.data.data.some((item: Json) => item.id === published.id), false);

      const archived = await transitionSummary(mf, published, "archived", identities.owner.token);
      const playerDelete = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/session-summaries/${archived.id}?version=${archived.version}`,
        { token: identities.playerOne.token, method: "DELETE" },
      );
      assert.equal(playerDelete.status, 403);

      const deleted = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/session-summaries/${archived.id}?version=${archived.version}`,
        { token: identities.owner.token, method: "DELETE" },
      );
      assert.equal(deleted.status, 204, JSON.stringify(deleted.data));
    });

    test("protege a API interna e cria post Discord para revisão", async () => {
      const path = "/api/internal/integration/discord/posts";
      const body = {
        campaignId: defaultCampaignId,
        interactionId: "923456789012345678",
        discordUserId: identities.automation.discordId,
        guildId: "123456789012345678",
        channelId: "223456789012345678",
        forumChannelId: "323456789012345678",
        forumTagId: null,
        personaName: "Aster",
        title: "Sinais no ermo",
        body: "A chama foi vista ao norte.",
      };
      const unauthorized = await api(mf, path, { method: "POST", body });
      assert.equal(unauthorized.status, 401);

      const created = await api(mf, path, {
        method: "POST",
        body,
        headers: {
          authorization:
            "Bearer test-integration-token-with-at-least-32-bytes",
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.post.status, "pending_review");
      assert.equal(created.data.post.source, "discord");
      assert.match(created.data.post.body, /Escrito por \*\*Aster\*\*/);

      const approved = await transitionPost(
        mf,
        created.data.post,
        "approved",
        identities.owner.token,
      );
      const published = await transitionPost(
        mf,
        approved,
        "published",
        identities.owner.token,
      );
      const publicationPath = "/api/internal/integration/discord/publications";
      const publication = {
        postId: published.id,
        campaignId: published.campaignId,
        guildId: "123456789012345678",
        forumChannelId: "323456789012345678",
        forumTagId: "423456789012345678",
        threadId: "523456789012345678",
        starterMessageId: "623456789012345678",
        publishedAt: "2026-08-22T21:00:00.000Z",
      };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const recorded = await api(mf, publicationPath, {
          method: "POST",
          body: publication,
          headers: {
            authorization:
              "Bearer test-integration-token-with-at-least-32-bytes",
          },
        });
        assert.equal(recorded.status, 200, JSON.stringify(recorded.data));
      }
      const audit = await api(mf, `/api/campaigns/${defaultCampaignId}/audit`, {
        token: identities.owner.token,
      });
      assert.equal(
        audit.data.data.filter(
          (entry: Json) =>
            entry.action === "discord.post.published" &&
            entry.entityId === publication.threadId,
        ).length,
        1,
      );
    });

    test("sincroniza personagens do Foundry com callback idempotente", async () => {
      const path = "/api/internal/integration/foundry/characters/sync";
      const sync = {
        worldId: "22222222-2222-4222-8222-222222222222",
        campaignId: defaultCampaignId,
        syncId: "33333333-3333-4333-8333-333333333333",
        capturedAt: "2026-08-23T02:00:00.000Z",
        characters: [
          {
            actorId: "aster-001",
            name: "Aster",
            type: "character",
            ownerUserIds: ["foundry-user-1"],
            level: 2,
            ancestry: "Humano",
            paths: {
              novice: "Guerreiro",
              expert: null,
              master: null,
              legendary: null,
            },
            statistics: {
              healthMax: 18,
              damage: 3,
              healingRate: 4,
              insanity: 1,
              corruption: 0,
            },
            wealth: { gc: 1, ss: 2, cp: 3, bits: 4 },
            sourceUpdatedAt: "2026-08-23T01:59:00.000Z",
          },
        ],
      };

      const unauthorized = await api(mf, path, { method: "POST", body: sync });
      assert.equal(unauthorized.status, 401);

      const first = await api(mf, path, {
        method: "POST",
        body: sync,
        headers: {
          authorization:
            "Bearer test-integration-token-with-at-least-32-bytes",
        },
      });
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.deepEqual(first.data, {
        syncId: sync.syncId,
        accepted: 1,
        duplicate: false,
        stale: false,
      });

      const duplicate = await api(mf, path, {
        method: "POST",
        body: sync,
        headers: {
          authorization:
            "Bearer test-integration-token-with-at-least-32-bytes",
        },
      });
      assert.equal(duplicate.status, 200, JSON.stringify(duplicate.data));
      assert.equal(duplicate.data.duplicate, true);

      const stale = await api(mf, path, {
        method: "POST",
        body: {
          ...sync,
          syncId: "44444444-4444-4444-8444-444444444444",
          capturedAt: "2026-08-23T01:00:00.000Z",
          characters: [
            {
              ...sync.characters[0],
              name: "Aster antigo",
              sourceUpdatedAt: "2026-08-23T00:59:00.000Z",
            },
          ],
        },
        headers: {
          authorization:
            "Bearer test-integration-token-with-at-least-32-bytes",
        },
      });
      assert.equal(stale.status, 200, JSON.stringify(stale.data));
      assert.deepEqual(stale.data, {
        syncId: "44444444-4444-4444-8444-444444444444",
        accepted: 0,
        duplicate: false,
        stale: true,
      });

      const projection = await db
        .prepare(
          `SELECT name, level, health_max, damage, is_active,
                  wealth_gc, wealth_ss, wealth_cp, wealth_bits
           FROM foundry_character_projections
           WHERE world_id = ? AND foundry_actor_id = ?`,
        )
        .bind(sync.worldId, sync.characters[0]?.actorId)
        .first();
      assert.deepEqual(projection, {
        name: "Aster",
        level: 2,
        health_max: 18,
        damage: 3,
        is_active: 1,
        wealth_gc: 1,
        wealth_ss: 2,
        wealth_cp: 3,
        wealth_bits: 4,
      });
      const auditCount = await db
        .prepare(
          `SELECT COUNT(*) AS count FROM audit_log
           WHERE action = 'foundry.characters.synced'
             AND entity_id = ?`,
        )
        .bind(sync.syncId)
        .first();
      assert.equal(auditCount?.count, 1);
    });

    test("vincula membro e ator com RBAC, exclusividade e auditoria", async () => {
      const campaignPath = `/api/campaigns/${defaultCampaignId}`;
      const managementPath = `${campaignPath}/character-links`;
      const playerOnePath = `${campaignPath}/members/${identities.playerOne.id}/character-link`;
      const playerTwoPath = `${campaignPath}/members/${identities.playerTwo.id}/character-link`;
      const input = {
        worldId: "22222222-2222-4222-8222-222222222222",
        actorId: "aster-001",
      };

      assert.equal(
        (await api(mf, managementPath, { token: identities.playerOne.token })).status,
        403,
      );
      assert.equal(
        (await api(mf, playerOnePath, {
          token: identities.playerOne.token,
          method: "PUT",
          body: input,
        })).status,
        403,
      );

      const linked = await api(mf, playerOnePath, {
        token: identities.gm.token,
        method: "PUT",
        body: input,
      });
      assert.equal(linked.status, 200, JSON.stringify(linked.data));
      assert.equal(linked.data.userId, identities.playerOne.id);
      assert.equal(linked.data.actorName, "Aster");
      assert.equal(linked.data.character.name, "Aster");

      const ownCharacters = await api(mf, "/api/me/characters", {
        token: identities.playerOne.token,
      });
      assert.equal(ownCharacters.status, 200, JSON.stringify(ownCharacters.data));
      assert.equal(
        ownCharacters.data.data.find((entry: Json) => entry.campaign.id === defaultCampaignId).link.actorId,
        "aster-001",
      );
      assert.deepEqual(
        ownCharacters.data.data.find((entry: Json) => entry.campaign.id === defaultCampaignId).link.character.wealth,
        { gc: 1, ss: 2, cp: 3, bits: 4 },
      );
      assert.equal(JSON.stringify(ownCharacters.data).includes(identities.playerTwo.id), false);

      const collision = await api(mf, playerTwoPath, {
        token: identities.owner.token,
        method: "PUT",
        body: input,
      });
      assert.equal(collision.status, 409);
      assert.equal(collision.data.error.code, "character_already_linked");

      assert.equal(
        (await api(mf, playerOnePath, {
          token: identities.playerOne.token,
          method: "DELETE",
        })).status,
        403,
      );
      assert.equal(
        (await api(mf, playerOnePath, {
          token: identities.gm.token,
          method: "DELETE",
        })).status,
        200,
      );

      const afterRemoval = await api(mf, "/api/me/characters", {
        token: identities.playerOne.token,
      });
      assert.equal(
        afterRemoval.data.data.find((entry: Json) => entry.campaign.id === defaultCampaignId).link,
        null,
      );
      const audit = await api(mf, `${campaignPath}/audit`, {
        token: identities.owner.token,
      });
      const actions = audit.data.data.map((entry: Json) => entry.action);
      assert.ok(actions.includes("character.link.created"));
      assert.ok(actions.includes("character.link.removed"));
    });

    test("protege, acompanha e decide pedidos assistidos do Mercador", async () => {
      const purchaseId = "a1111111-1111-4111-8111-111111111111";
      const callbackPurchaseId = "a2222222-2222-4222-8222-222222222222";
      const commandId = "a3333333-3333-4333-8333-333333333333";
      for (const [id, status] of [
        [purchaseId, "awaiting_master"],
        [callbackPurchaseId, "pending_delivery"],
      ]) {
        await db.prepare(
          `INSERT INTO merchant_purchase_requests (
             id, campaign_id, requester_user_id, world_id, buyer_actor_id,
             buyer_actor_name, merchant_actor_id, catalog_sync_id, item_id,
             item_name, price_snapshot, quantity, note, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id,
          defaultCampaignId,
          identities.playerOne.id,
          "22222222-2222-4222-8222-222222222222",
          "aster-001",
          "Aster",
          "merchant-001",
          "b1111111-1111-4111-8111-111111111111",
          "item-001",
          "Óleo de lanterna",
          "2 cp",
          1,
          "Antes da próxima missão.",
          status,
        ).run();
      }

      const path = `/api/campaigns/${defaultCampaignId}/merchant/purchases`;
      assert.equal((await api(mf, path)).status, 401);
      const own = await api(mf, `${path}?scope=self`, {
        token: identities.playerOne.token,
      });
      assert.equal(own.status, 200, JSON.stringify(own.data));
      assert.equal(own.data.data.length, 2);
      assert.equal(own.data.data[0].requester.userId, identities.playerOne.id);
      const otherPlayer = await api(mf, path, { token: identities.playerTwo.token });
      assert.deepEqual(otherPlayer.data.data, []);
      const management = await api(mf, path, { token: identities.gm.token });
      assert.equal(management.data.data.length, 2);

      const forbidden = await api(mf, `${path}/${purchaseId}`, {
        token: identities.playerOne.token,
        method: "PATCH",
        body: { action: "fulfill", resolutionNote: null },
      });
      assert.equal(forbidden.status, 403);

      const fulfilled = await api(mf, `${path}/${purchaseId}`, {
        token: identities.gm.token,
        method: "PATCH",
        body: { action: "fulfill", resolutionNote: "Entregue na ficha." },
      });
      assert.equal(fulfilled.status, 200, JSON.stringify(fulfilled.data));
      assert.equal(fulfilled.data.status, "fulfilled");
      assert.equal(fulfilled.data.resolvedByName, identities.gm.displayName);

      const callbackPath = "/api/internal/integration/foundry/merchant-purchases/delivery";
      const callback = {
        requestId: callbackPurchaseId,
        commandId,
        outcome: "succeeded",
        error: null,
        deliveredAt: "2026-09-11T12:00:00.000Z",
      };
      assert.equal((await api(mf, callbackPath, { method: "POST", body: callback })).status, 401);
      const delivered = await api(mf, callbackPath, {
        method: "POST",
        body: callback,
        headers: { authorization: "Bearer test-integration-token-with-at-least-32-bytes" },
      });
      assert.equal(delivered.status, 200, JSON.stringify(delivered.data));
      assert.equal(delivered.data.status, "awaiting_master");

      const repeated = await api(mf, callbackPath, {
        method: "POST",
        body: callback,
        headers: { authorization: "Bearer test-integration-token-with-at-least-32-bytes" },
      });
      assert.equal(repeated.status, 200);
      const audits = await db.prepare(
        `SELECT action FROM audit_log
         WHERE entity_type = 'merchant_purchase_request' AND entity_id = ?`,
      ).bind(callbackPurchaseId).all();
      assert.equal(audits.results.filter((row: Json) => row.action === "merchant.purchase.delivered").length, 1);
    });

    test("arquiva, restaura e restringe a exclusão permanente de posts", async () => {
      const created = await api(mf, `/api/campaigns/${defaultCampaignId}/posts`, {
        token: identities.owner.token,
        method: "POST",
        body: {
          campaignId: defaultCampaignId,
          title: "Registro descartável",
          body: "Conteúdo usado para validar o ciclo de vida.",
          source: "manual",
        },
      });
      assert.equal(created.status, 201);

      const archived = await api(
        mf,
        `/api/posts/${created.data.id}?version=${created.data.version}&mode=archive`,
        { token: identities.owner.token, method: "DELETE" },
      );
      assert.equal(archived.status, 204);

      const playerRestore = await api(mf, `/api/posts/${created.data.id}`, {
        token: identities.playerOne.token,
        method: "PATCH",
        body: { version: created.data.version + 1, status: "draft" },
      });
      assert.equal(playerRestore.status, 403);

      const restored = await api(mf, `/api/posts/${created.data.id}`, {
        token: identities.owner.token,
        method: "PATCH",
        body: { version: created.data.version + 1, status: "draft" },
      });
      assert.equal(restored.status, 200, JSON.stringify(restored.data));

      const rearchived = await api(
        mf,
        `/api/posts/${created.data.id}?version=${restored.data.version}&mode=archive`,
        { token: identities.owner.token, method: "DELETE" },
      );
      assert.equal(rearchived.status, 204);

      const editorial = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/posts?scope=editorial`,
        { token: identities.owner.token },
      );
      const archivedPost = editorial.data.data.find((post: Json) => post.id === created.data.id);
      assert.equal(archivedPost.status, "archived");

      const managerDelete = await api(
        mf,
        `/api/posts/${created.data.id}?version=${archivedPost.version}&mode=permanent`,
        { token: identities.manager.token, method: "DELETE" },
      );
      assert.equal(managerDelete.status, 403);

      const ownerDelete = await api(
        mf,
        `/api/posts/${created.data.id}?version=${archivedPost.version}&mode=permanent`,
        { token: identities.owner.token, method: "DELETE" },
      );
      assert.equal(ownerDelete.status, 204, JSON.stringify(ownerDelete.data));

      const afterDelete = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/posts?scope=editorial`,
        { token: identities.owner.token },
      );
      assert.equal(afterDelete.data.data.some((post: Json) => post.id === created.data.id), false);
    });

    test("abre uma crônica publicada sem expor rascunhos nem campanhas privadas", async () => {
      const published = await api(mf, "/api/posts/33333333-3333-4333-8333-333333333331");
      assert.equal(published.status, 200, JSON.stringify(published.data));
      assert.equal(published.data.title, "A Chama que Permaneceu");
      assert.equal(published.data.status, "published");

      const missing = await api(mf, "/api/posts/00000000-0000-4000-8000-00000000abcd");
      assert.equal(missing.status, 404);

      // Publicação de campanha privada não aparece para quem está fora dela.
      const privatePost = await api(
        mf,
        `/api/posts/${privateCampaign.postId}?campaignId=${privateCampaign.id}`,
      );
      assert.notEqual(privatePost.status, 200);
      const privatePostForMember = await api(
        mf,
        `/api/posts/${privateCampaign.postId}?campaignId=${privateCampaign.id}`,
        { token: identities.playerOne.token },
      );
      assert.equal(privatePostForMember.status, 200);
    });

    test("mantém o catálogo do Lojista e sorteia o estoque com RBAC", async () => {
      const catalogPath = `/api/campaigns/${defaultCampaignId}/merchant/catalog`;
      const sameOrigin = { "sec-fetch-site": "same-origin" };

      assert.equal((await api(mf, catalogPath, { token: identities.playerOne.token })).status, 403);
      assert.equal(
        (await api(mf, `${catalogPath}/import-base`, { token: identities.playerOne.token, method: "POST", headers: sameOrigin })).status,
        403,
      );

      const imported = await api(mf, `${catalogPath}/import-base`, { token: identities.gm.token, method: "POST", headers: sameOrigin });
      assert.equal(imported.status, 200, JSON.stringify(imported.data));
      assert.deepEqual(imported.data, { created: 137, skipped: 0 });
      const again = await api(mf, `${catalogPath}/import-base`, { token: identities.gm.token, method: "POST", headers: sameOrigin });
      assert.deepEqual(again.data, { created: 0, skipped: 137 });

      const catalog = await api(mf, catalogPath, { token: identities.gm.token });
      assert.equal(catalog.status, 200);
      assert.equal(catalog.data.data.length, 137);
      const longbow = catalog.data.data.find((item: Json) => item.name === "Arco longo");
      assert.deepEqual(longbow.requirement, { attribute: "strength", minimum: 9 });
      assert.match(longbow.icon, /^systems\/demonlord\/assets\/icons\/weapons\/longbow\.webp$/);

      const duplicate = await api(mf, catalogPath, {
        token: identities.gm.token,
        method: "POST",
        body: { name: "Arco longo", category: "Armas à Distância", kind: "weapon", availability: "uncommon", price: "1 co" },
      });
      assert.equal(duplicate.status, 409);

      const staleUpdate = await api(mf, `${catalogPath}/${longbow.id}`, {
        token: identities.gm.token,
        method: "PATCH",
        body: { active: false, version: longbow.version + 1 },
      });
      assert.equal(staleUpdate.status, 409);
      const deactivated = await api(mf, `${catalogPath}/${longbow.id}`, {
        token: identities.gm.token,
        method: "PATCH",
        body: { active: false, version: longbow.version },
      });
      assert.equal(deactivated.status, 200, JSON.stringify(deactivated.data));
      assert.equal(deactivated.data.active, false);

      const drawsPath = `/api/campaigns/${defaultCampaignId}/merchant/stock/draws`;
      const criteria = { maxAvailability: "uncommon", categories: ["Armas à Distância"], quantity: 20, allowRepeat: false };
      const draw = await api(mf, drawsPath, { token: identities.gm.token, method: "POST", body: criteria });
      assert.equal(draw.status, 201, JSON.stringify(draw.data));
      assert.equal(draw.data.status, "preview");
      // Arco, Besta, Funda e Zarabatana: o Arco longo foi desativado; os raros e exóticos ficam fora.
      assert.equal(draw.data.eligibleCount, 4);
      assert.equal(draw.data.entries.length, 4);
      for (const entry of draw.data.entries) {
        assert.equal(entry.category, "Armas à Distância");
        assert.ok(["common", "uncommon"].includes(entry.availability));
        assert.equal(entry.quantity, 1);
      }

      const redraw = await api(mf, drawsPath, { token: identities.gm.token, method: "POST", body: criteria });
      assert.equal(redraw.status, 201);
      const history = await api(mf, drawsPath, { token: identities.gm.token });
      assert.deepEqual(history.data.data.map((item: Json) => item.id), [redraw.data.id]);

      const impossible = await api(mf, drawsPath, {
        token: identities.gm.token,
        method: "POST",
        body: { ...criteria, categories: ["Categoria inexistente"] },
      });
      assert.equal(impossible.status, 422);

      // O envio real passa pelo bridge; aqui simulamos o comando já na fila.
      await db.prepare("UPDATE merchant_stock_draws SET status = 'pending_delivery' WHERE id = ?").bind(redraw.data.id).run();
      const callbackPath = "/api/internal/integration/foundry/merchant-stock/delivery";
      const callback = {
        drawId: redraw.data.id,
        commandId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        outcome: "succeeded",
        error: null,
        deliveredAt: "2026-09-25T12:00:00.000Z",
      };
      assert.equal((await api(mf, callbackPath, { method: "POST", body: callback })).status, 401);
      const delivered = await api(mf, callbackPath, {
        method: "POST",
        body: callback,
        headers: { authorization: "Bearer test-integration-token-with-at-least-32-bytes" },
      });
      assert.equal(delivered.status, 200, JSON.stringify(delivered.data));
      assert.equal(delivered.data.status, "applied");
      assert.equal(delivered.data.appliedAt, "2026-09-25T12:00:00.000Z");
    });

    test("registra as mutações na auditoria", async () => {
      const audit = await api(mf, `/api/campaigns/${defaultCampaignId}/audit`, {
        token: identities.owner.token,
      });
      assert.equal(audit.status, 200);
      const actions = new Set(audit.data.data.map((entry: Json) => entry.action));
      for (const action of [
        "member.updated",
        "member.added",
        "mission.created",
        "mission.published",
        "mission.signup",
        "mission.withdrawal",
        "post.created",
        "post.approved",
        "post.published",
        "discord.post.published",
        "post.deleted_permanently",
        "session_summary.deleted_permanently",
        "merchant.catalog.imported",
        "merchant.catalog.deactivated",
        "merchant.stock.drawn",
        "merchant.stock.applied",
      ]) {
        assert.equal(actions.has(action), true, `ação ausente: ${action}`);
      }
    });
  }
});

const privateCampaign = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  missionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  postId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

function user(id: string, suffix: string, role: string | null) {
  return {
    id,
    discordId: `discord-${suffix}`,
    displayName: `Teste ${suffix}`,
    role,
    token: `marco1-${suffix}-session`,
  };
}

async function applyMigrations(db: TestDatabase) {
  const directory = migrationsRoot;
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(join(directory, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const query = statement.trim();
      if (query) await db.prepare(query).run();
    }
  }
}

async function seedDatabase(db: TestDatabase) {
  const statements = [];
  for (const identity of Object.values(identities)) {
    statements.push(
      db
        .prepare(
          `INSERT INTO iam_users (id, discord_user_id, display_name)
           VALUES (?, ?, ?)`,
        )
        .bind(identity.id, identity.discordId, identity.displayName),
      db
        .prepare(
          `INSERT INTO iam_sessions (id, user_id, expires_at)
           VALUES (?, ?, ?)`,
        )
        .bind(sessionId(identity.token), identity.id, "2099-01-01T00:00:00.000Z"),
    );
    if (identity.role) {
      statements.push(
        db
          .prepare(
            `INSERT INTO campaign_members (campaign_id, user_id, status)
             VALUES (?, ?, 'active')`,
          )
          .bind(defaultCampaignId, identity.id),
        db
          .prepare(
            `INSERT INTO iam_role_assignments (
              id, user_id, role_name, scope_kind, scope_id, granted_by
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            identity.id,
            identity.role,
            identity.role === "owner" ? "global" : "campaign",
            identity.role === "owner" ? "*" : defaultCampaignId,
            identities.owner.id,
          ),
      );
    }
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO campaigns (
          id, slug, name, description, status, is_public
        ) VALUES (?, 'campanha-privada', 'Campanha privada', '', 'active', 0)`,
      )
      .bind(privateCampaign.id),
    db
      .prepare(
        `INSERT INTO campaign_members (campaign_id, user_id, status)
         VALUES (?, ?, 'active')`,
      )
      .bind(privateCampaign.id, identities.playerOne.id),
    db
      .prepare(
        `INSERT INTO iam_role_assignments (
          id, user_id, role_name, scope_kind, scope_id, granted_by
        ) VALUES (?, ?, 'player', 'campaign', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        identities.playerOne.id,
        privateCampaign.id,
        identities.owner.id,
      ),
    db
      .prepare(
        `INSERT INTO missions (
          id, campaign_id, author_user_id, title, summary, region,
          status, risk, party_size, published_at
        ) VALUES (?, ?, ?, 'Missão privada', 'Conteúdo reservado.', 'Ermos',
          'published', 'unknown', 5, CURRENT_TIMESTAMP)`,
      )
      .bind(privateCampaign.missionId, privateCampaign.id, identities.owner.id),
    db
      .prepare(
        `INSERT INTO posts (
          id, campaign_id, author_user_id, title, body, status, published_at
        ) VALUES (?, ?, ?, 'Post privado', 'Conteúdo reservado.',
          'published', CURRENT_TIMESTAMP)`,
      )
      .bind(privateCampaign.postId, privateCampaign.id, identities.owner.id),
  );

  await db.batch(statements);
}

function sessionId(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

async function api(
  mf: Miniflare,
  path: string,
  options: ApiOptions = {},
): Promise<{ status: number; data: Json }> {
  const headers = new Headers({ accept: "application/json" });
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }
  if (options.token) headers.set("cookie", `ordem_session=${options.token}`);
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("sec-fetch-site", "same-origin");
  }
  const response = await mf.dispatchFetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    redirect: "manual",
  });
  const data: Json = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}

function hasCapability(me: Json, permission: string): boolean {
  return me.capabilities.some((capability: Json) => capability.permission === permission);
}

function missionInput(title: string) {
  return {
    campaignId: defaultCampaignId,
    title,
    summary: "Um chamado preparado para validar o fluxo editorial.",
    region: "Ermos",
    risk: "dangerous",
    scheduledFor: null,
    partySize: 1,
  };
}

async function transitionMission(mf: Miniflare, mission: Json, status: string, token: string) {
  const response = await api(mf, `/api/missions/${mission.id}`, {
    token,
    method: "PATCH",
    body: { version: mission.version, status },
  });
  assert.equal(response.status, 200);
  return response.data;
}

async function transitionPost(mf: Miniflare, post: Json, status: string, token: string) {
  const response = await api(mf, `/api/posts/${post.id}`, {
    token,
    method: "PATCH",
    body: { version: post.version, status },
  });
  return response.status === 200 ? response.data : response;
}

async function transitionSummary(mf: Miniflare, summary: Json, status: string, token: string) {
  const response = await api(
    mf,
    `/api/campaigns/${summary.campaignId}/session-summaries/${summary.id}`,
    {
      token,
      method: "PATCH",
      body: { version: summary.version, status },
    },
  );
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}
