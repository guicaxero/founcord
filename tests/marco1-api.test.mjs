import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
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

test("Marco 1: autenticação, RBAC, campanha, missões, posts e auditoria", async (t) => {
  const serverRoot = join(root, ".wrangler", "test-bundle");
  const mf = new Miniflare(convertV4MiniflareOptions({
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

  try {
    const db = await mf.getD1Database("DB");
    await applyMigrations(db);
    await seedDatabase(db);

    await t.test("inicia OAuth Discord com state, PKCE e cookie", async () => {
      const response = await mf.dispatchFetch(
        `${origin}/api/auth/discord?returnTo=/dashboard`,
        { redirect: "manual" },
      );
      assert.equal(response.status, 302);
      const location = new URL(response.headers.get("location"));
      assert.equal(location.origin, "https://discord.com");
      assert.ok(location.searchParams.get("state"));
      assert.ok(location.searchParams.get("code_challenge"));
      assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
    });

    await t.test("protege campanhas privadas e permite membros ativos", async () => {
      const anonymousCampaigns = await api(mf, "/api/campaigns");
      assert.equal(anonymousCampaigns.status, 200);
      assert.equal(
        anonymousCampaigns.data.data.some((item) => item.id === privateCampaign.id),
        false,
      );

      for (const path of [
        `/api/campaigns/${privateCampaign.id}`,
        `/api/campaigns/${privateCampaign.id}/missions`,
        `/api/campaigns/${privateCampaign.id}/posts`,
      ]) {
        assert.equal((await api(mf, path)).status, 404);
        assert.equal((await api(mf, path, { token: identities.playerOne.token })).status, 200);
      }
    });

    await t.test("remove permissões efetivas ao suspender um membro", async () => {
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

    await t.test("permite ao gestor adicionar jogador, mas não atribuir privilégio", async () => {
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

    await t.test("executa o fluxo completo de missão e promove a lista de espera", async () => {
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
        signups.data.data.map((signup) => [signup.userId, signup.status]),
        [[identities.playerTwo.id, "confirmed"]],
      );
    });

    await t.test("obriga revisão humana no fluxo de posts", async () => {
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
      const visible = publicPosts.data.data.find((post) => post.id === published.id);
      assert.equal(visible.title, "Relato extraído automaticamente");
    });

    await t.test("protege a API interna e cria post Discord para revisão", async () => {
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
          (entry) =>
            entry.action === "discord.post.published" &&
            entry.entityId === publication.threadId,
        ).length,
        1,
      );
    });

    await t.test("arquiva, restaura e restringe a exclusão permanente de posts", async () => {
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
      const archivedPost = editorial.data.data.find((post) => post.id === created.data.id);
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
      assert.equal(afterDelete.data.data.some((post) => post.id === created.data.id), false);
    });

    await t.test("registra as mutações na auditoria", async () => {
      const audit = await api(mf, `/api/campaigns/${defaultCampaignId}/audit`, {
        token: identities.owner.token,
      });
      assert.equal(audit.status, 200);
      const actions = new Set(audit.data.data.map((entry) => entry.action));
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
      ]) {
        assert.equal(actions.has(action), true, `ação ausente: ${action}`);
      }
    });
  } finally {
    await mf.dispose();
  }
});

const privateCampaign = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  missionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  postId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

function user(id, suffix, role) {
  return {
    id,
    discordId: `discord-${suffix}`,
    displayName: `Teste ${suffix}`,
    role,
    token: `marco1-${suffix}-session`,
  };
}

async function applyMigrations(db) {
  const directory = join(root, "drizzle");
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

async function seedDatabase(db) {
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

function sessionId(token) {
  return createHash("sha256").update(token).digest("base64url");
}

async function api(mf, path, options = {}) {
  const headers = new Headers({ accept: "application/json" });
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }
  if (options.token) headers.set("cookie", `vigilia_session=${options.token}`);
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("sec-fetch-site", "same-origin");
  }
  const response = await mf.dispatchFetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}

function hasCapability(me, permission) {
  return me.capabilities.some((capability) => capability.permission === permission);
}

function missionInput(title) {
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

async function transitionMission(mf, mission, status, token) {
  const response = await api(mf, `/api/missions/${mission.id}`, {
    token,
    method: "PATCH",
    body: { version: mission.version, status },
  });
  assert.equal(response.status, 200);
  return response.data;
}

async function transitionPost(mf, post, status, token) {
  const response = await api(mf, `/api/posts/${post.id}`, {
    token,
    method: "PATCH",
    body: { version: post.version, status },
  });
  return response.status === 200 ? response.data : response;
}
