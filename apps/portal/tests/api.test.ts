import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, test } from "vitest";
import { convertV4MiniflareOptions, FormData as MiniflareFormData, Miniflare } from "miniflare";

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
      kvNamespaces: ["MEDIA"],
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
      ]) {
        assert.equal((await api(mf, path)).status, 404);
        assert.equal((await api(mf, path, { token: identities.playerOne.token })).status, 200);
      }
      // O Diário nasce fechado: o membro vê a campanha, mas não o Diário.
      const privateDiary = `/api/campaigns/${privateCampaign.id}/session-summaries`;
      assert.equal((await api(mf, privateDiary)).status, 404);
      const closedDiary = await api(mf, privateDiary, { token: identities.playerOne.token });
      assert.equal(closedDiary.status, 403);
      assert.equal(closedDiary.data.error.code, "diary_restricted");
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

    test("separa os chamados abertos do registro de missões", async () => {
      const created = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`, {
        token: identities.gm.token,
        method: "POST",
        body: missionInput("A ponte dos enforcados"),
      });
      const pending = await transitionMission(mf, created.data, "pending_review", identities.gm.token);
      const approved = await transitionMission(mf, pending, "approved", identities.owner.token);
      const published = await transitionMission(mf, approved, "published", identities.owner.token);
      assert.equal(published.outcome, null);

      // O mestre de mesa não publica, então também não registra.
      const gmRecord = await api(mf, `/api/missions/${published.id}`, {
        token: identities.gm.token,
        method: "PATCH",
        body: { version: published.version, outcome: "in_progress" },
      });
      assert.equal(gmRecord.status, 403);

      const departed = await api(mf, `/api/missions/${published.id}`, {
        token: identities.owner.token,
        method: "PATCH",
        body: { version: published.version, outcome: "in_progress", number: 7 },
      });
      assert.equal(departed.status, 200, JSON.stringify(departed.data));
      assert.equal(departed.data.outcome, "in_progress");
      assert.equal(departed.data.number, 7);
      assert.ok(departed.data.recordedAt);

      const lateSignup = await api(mf, `/api/missions/${published.id}/signups`, {
        token: identities.playerOne.token,
        method: "POST",
      });
      assert.equal(lateSignup.status, 409);
      assert.equal(lateSignup.data.error.code, "mission_not_open");

      const finished = await api(mf, `/api/missions/${published.id}`, {
        token: identities.owner.token,
        method: "PATCH",
        body: { version: departed.data.version, outcome: "completed", report: "A ponte caiu com os enforcados." },
      });
      assert.equal(finished.data.outcome, "completed");
      assert.equal(finished.data.report, "A ponte caiu com os enforcados.");

      // Missão antiga: entra publicada direto no registro, e o número é único.
      const old = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`, {
        token: identities.owner.token,
        method: "POST",
        body: { ...missionInput("Problemas na Vila de Asilo"), number: 1, outcome: "failed", report: "Ninguém voltou." },
      });
      assert.equal(old.status, 201, JSON.stringify(old.data));
      assert.equal(old.data.status, "published");
      assert.equal(old.data.outcome, "failed");
      const duplicate = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`, {
        token: identities.owner.token,
        method: "POST",
        body: { ...missionInput("Outra missão número um"), number: 1, outcome: "completed" },
      });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.data.error.code, "mission_number_taken");
      const gmOld = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`, {
        token: identities.gm.token,
        method: "POST",
        body: { ...missionInput("Registro sem permissão"), outcome: "completed" },
      });
      assert.equal(gmOld.status, 403);

      // Rascunho não entra no registro.
      const draftRecord = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`, {
        token: identities.gm.token,
        method: "POST",
        body: missionInput("Rascunho qualquer"),
      });
      const notPublished = await api(mf, `/api/missions/${draftRecord.data.id}`, {
        token: identities.owner.token,
        method: "PATCH",
        body: { version: draftRecord.data.version, outcome: "completed" },
      });
      assert.equal(notPublished.status, 409);
      assert.equal(notPublished.data.error.code, "mission_not_published");

      const listed = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`);
      const byId = new Map(listed.data.data.map((mission: Json) => [mission.id, mission]));
      assert.equal((byId.get(published.id) as Json).outcome, "completed");
      assert.equal((byId.get(old.data.id) as Json).number, 1);
      assert.equal(byId.has(draftRecord.data.id), false);
    });

    test("Registro dos Corvos: avulsos, correções, participantes e visibilidade", async () => {
      const ravensPath = `/api/campaigns/${defaultCampaignId}/ravens`;
      const blank = {
        name: null, playerName: null, ancestry: null, novicePath: null, expertPath: null, masterPath: null,
        level: null, sessionsPlayed: null, missionsCompleted: null, missionsFailed: null, lastMission: null,
        activities: null,
        attributes: { strength: null, agility: null, intellect: null, will: null, perception: null },
        stats: { health: null, healingRate: null, defense: null, speed: null, power: null, insanity: null, corruption: null },
      };
      const body = {
        campaignId: defaultCampaignId,
        status: "dead",
        listed: true,
        userId: null,
        imageMediaId: null,
        overrides: { ...blank, name: "Brom, o Fauno", ancestry: "Fauno", novicePath: "Sacerdote", level: 1, attributes: { ...blank.attributes, will: 12 } },
      };

      const denied = await api(mf, ravensPath, { token: identities.playerOne.token, method: "POST", body });
      assert.equal(denied.status, 403);
      const nameless = await api(mf, ravensPath, {
        token: identities.owner.token,
        method: "POST",
        body: { ...body, overrides: { ...body.overrides, name: null } },
      });
      assert.equal(nameless.status, 422);

      const created = await api(mf, ravensPath, { token: identities.owner.token, method: "POST", body });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.effective.source, "manual");
      assert.equal(created.data.effective.attributes.will, 12);
      const ravenId = created.data.id;

      // Participou de uma missão concluída: a contagem e a última missão são automáticas.
      const mission = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`, {
        token: identities.owner.token,
        method: "POST",
        body: { ...missionInput("A cripta do Fauno"), number: 42, outcome: "completed" },
      });
      const gmParticipants = await api(mf, `/api/missions/${mission.data.id}/participants`, {
        token: identities.gm.token,
        method: "PUT",
        body: { ravenIds: [ravenId] },
      });
      assert.equal(gmParticipants.status, 403);
      const participants = await api(mf, `/api/missions/${mission.data.id}/participants`, {
        token: identities.owner.token,
        method: "PUT",
        body: { ravenIds: [ravenId] },
      });
      assert.equal(participants.status, 200, JSON.stringify(participants.data));
      assert.deepEqual(participants.data.participants.map((participant: Json) => participant.id), [ravenId]);

      const sheet = await api(mf, `/api/ravens/${ravenId}`);
      assert.equal(sheet.status, 200, JSON.stringify(sheet.data));
      assert.equal(sheet.data.missionsCompleted, 1);
      assert.equal(sheet.data.lastMission.id, mission.data.id);
      assert.equal(sheet.data.paths.novice, "Sacerdote");

      // Correção manual substitui o automático; apagada, ele volta.
      const corrected = await api(mf, `/api/ravens/${ravenId}`, {
        token: identities.owner.token,
        method: "PATCH",
        body: { ...body, campaignId: undefined, version: created.data.version, overrides: { ...body.overrides, missionsCompleted: 3 } },
      });
      assert.equal(corrected.status, 200, JSON.stringify(corrected.data));
      assert.equal(corrected.data.effective.missionsCompleted, 3);
      assert.equal(corrected.data.automatic.missionsCompleted, 1);
      const stale = await api(mf, `/api/ravens/${ravenId}`, {
        token: identities.owner.token,
        method: "PATCH",
        body: { ...body, campaignId: undefined, version: created.data.version },
      });
      assert.equal(stale.status, 409);

      // Oculto: some do registro público, mas a gestão continua vendo.
      const hidden = await api(mf, `/api/ravens/${ravenId}`, {
        token: identities.owner.token,
        method: "PATCH",
        body: { ...body, campaignId: undefined, listed: false, version: corrected.data.version },
      });
      assert.equal(hidden.status, 200, JSON.stringify(hidden.data));
      assert.equal((await api(mf, `/api/ravens/${ravenId}`)).status, 404);
      const publicList = await api(mf, ravensPath);
      assert.equal(publicList.data.data.some((raven: Json) => raven.id === ravenId), false);
      const managed = await api(mf, `${ravensPath}/manage`, { token: identities.owner.token });
      assert.equal(managed.data.data.some((raven: Json) => raven.id === ravenId), true);
      assert.equal((await api(mf, `${ravensPath}/manage`, { token: identities.playerOne.token })).status, 403);
      const publicMission = await api(mf, `/api/missions/${mission.data.id}`);
      assert.deepEqual(publicMission.data.participants, []);
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

      // Fechado, o Diário é só da gestão: jogadores e visitantes recebem 403.
      for (const token of [undefined, identities.playerOne.token]) {
        const closed = await api(mf, `/api/campaigns/${defaultCampaignId}/session-summaries`, token ? { token } : {});
        assert.equal(closed.status, 403);
        assert.equal(closed.data.error.code, "diary_restricted");
        const me = await api(mf, "/api/me", token ? { token } : {});
        assert.deepEqual(me.data.diary, { visible: false, openToPlayers: false });
      }
      const ownerMe = await api(mf, "/api/me", { token: identities.owner.token });
      assert.deepEqual(ownerMe.data.diary, { visible: true, openToPlayers: false });

      const campaign = await api(mf, `/api/campaigns/${defaultCampaignId}`, { token: identities.owner.token });
      const playerOpens = await api(mf, `/api/campaigns/${defaultCampaignId}`, {
        token: identities.playerOne.token,
        method: "PATCH",
        body: { version: campaign.data.version, diaryPublic: true },
      });
      assert.equal(playerOpens.status, 403);
      const opened = await api(mf, `/api/campaigns/${defaultCampaignId}`, {
        token: identities.owner.token,
        method: "PATCH",
        body: { version: campaign.data.version, diaryPublic: true },
      });
      assert.equal(opened.status, 200, JSON.stringify(opened.data));
      assert.equal(opened.data.diaryPublic, true);
      const playerMe = await api(mf, "/api/me", { token: identities.playerOne.token });
      assert.deepEqual(playerMe.data.diary, { visible: true, openToPlayers: true });

      const publicDrafts = await api(
        mf,
        `/api/campaigns/${defaultCampaignId}/session-summaries`,
      );
      assert.equal(publicDrafts.status, 200);
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

      // Retrato e token (módulo 0.9.0+): gravados quando enviados, preservados
      // quando o módulo antigo não envia os campos, apagados quando vêm null.
      const portrait = "data:image/webp;base64,UklGRlBPUlRSQUlU";
      const token = "data:image/webp;base64,UklGRlRPS0VO";
      const imageSteps = [
        { syncId: "55555555-5555-4555-8555-555555555555", capturedAt: "2026-08-23T03:00:00.000Z", images: { portraitUrl: portrait, tokenUrl: token }, expected: [portrait, token] },
        { syncId: "66666666-6666-4666-8666-666666666666", capturedAt: "2026-08-23T04:00:00.000Z", images: {}, expected: [portrait, token] },
        { syncId: "77777777-7777-4777-8777-777777777777", capturedAt: "2026-08-23T05:00:00.000Z", images: { portraitUrl: null, tokenUrl: token }, expected: [null, token] },
      ];
      for (const step of imageSteps) {
        const response = await api(mf, path, {
          method: "POST",
          body: { ...sync, syncId: step.syncId, capturedAt: step.capturedAt, characters: [{ ...sync.characters[0], ...step.images }] },
          headers: { authorization: "Bearer test-integration-token-with-at-least-32-bytes" },
        });
        assert.equal(response.status, 200, JSON.stringify(response.data));
        const images = await db
          .prepare("SELECT portrait_url, token_url FROM foundry_character_projections WHERE world_id = ? AND foundry_actor_id = ?")
          .bind(sync.worldId, sync.characters[0]?.actorId)
          .first();
        assert.deepEqual([images?.portrait_url ?? null, images?.token_url ?? null], step.expected, step.syncId);
      }
      const insecure = await api(mf, path, {
        method: "POST",
        body: {
          ...sync,
          syncId: "88888888-8888-4888-8888-888888888888",
          capturedAt: "2026-08-23T06:00:00.000Z",
          characters: [{ ...sync.characters[0], portraitUrl: "http://foundry.local/aster.webp" }],
        },
        headers: { authorization: "Bearer test-integration-token-with-at-least-32-bytes" },
      });
      assert.equal(insecure.status, 422);
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

      // O vínculo coloca o personagem no Registro dos Corvos, com os dados do Foundry.
      const registry = await api(mf, `${campaignPath}/ravens`);
      const aster = registry.data.data.find((raven: Json) => raven.name === "Aster");
      assert.ok(aster, JSON.stringify(registry.data));
      assert.equal(aster.source, "foundry");
      assert.equal(aster.playerName, identities.playerOne.displayName);

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

      // Ficha completa (módulo 0.11.0+): só o jogador vinculado a recebe.
      const sheetPath = `/api/me/characters/${defaultCampaignId}/sheet`;
      const beforeSheet = await api(mf, sheetPath, { token: identities.playerOne.token });
      assert.equal(beforeSheet.status, 200, JSON.stringify(beforeSheet.data));
      assert.equal(beforeSheet.data.sheet, null);
      const sheet = {
        attributes: { strength: 12, agility: 11, intellect: 10, will: 9, perception: 11 },
        characteristics: { defense: 13, speed: 10, power: 0, size: "1", fortune: 1 },
        appearance: { age: "27", sex: null, eyes: "Verdes", hair: null, height: null, weight: null, feature: null },
        religion: null,
        inventory: [
          {
            id: "espada-1",
            name: "Espada",
            description: "",
            type: "weapon",
            quantity: 1,
            equipped: true,
            price: "1 co",
            availability: "C",
            properties: null,
            damage: "1d6",
            hands: "one",
            defense: null,
            consumableType: null,
          },
        ],
        spells: [],
        talents: [
          { id: "t-1", name: "Golpe Firme", description: "", kind: "talent", group: "Guerreiro", uses: { value: null, max: null } },
        ],
        roots: { ancestry: { name: "Humano", description: "" }, professions: [], languages: [{ name: "Comum", speak: true, read: true, write: false }] },
        notes: { text: "Veio do norte.", revision: "a1b2c3" },
      };
      const syncPath = "/api/internal/integration/foundry/characters/sync";
      const serviceAuth = { authorization: "Bearer test-integration-token-with-at-least-32-bytes" };
      const sheetSync = {
        worldId: input.worldId,
        campaignId: defaultCampaignId,
        syncId: "99999999-9999-4999-8999-999999999991",
        capturedAt: "2026-08-23T07:00:00.000Z",
        characters: [
          {
            actorId: "aster-001",
            name: "Aster",
            type: "character",
            ownerUserIds: ["foundry-user-1"],
            level: 2,
            ancestry: "Humano",
            paths: { novice: "Guerreiro", expert: null, master: null, legendary: null },
            statistics: { healthMax: 18, damage: 3, healingRate: 4, insanity: 1, corruption: 0 },
            wealth: { gc: 1, ss: 2, cp: 3, bits: 4 },
            sheet,
            sourceUpdatedAt: "2026-08-23T06:59:00.000Z",
          },
        ],
      };
      const synced = await api(mf, syncPath, { method: "POST", body: sheetSync, headers: serviceAuth });
      assert.equal(synced.status, 200, JSON.stringify(synced.data));
      const ownSheet = await api(mf, sheetPath, { token: identities.playerOne.token });
      assert.equal(ownSheet.status, 200, JSON.stringify(ownSheet.data));
      assert.deepEqual(ownSheet.data.sheet, sheet);
      assert.equal(ownSheet.data.actorName, "Aster");
      assert.equal((await api(mf, sheetPath, { token: identities.playerTwo.token })).status, 404);
      assert.equal((await api(mf, sheetPath)).status, 401);
      // Um módulo antigo não envia a ficha: a anterior é preservada.
      await api(mf, syncPath, {
        method: "POST",
        body: {
          ...sheetSync,
          syncId: "99999999-9999-4999-8999-999999999992",
          capturedAt: "2026-08-23T08:00:00.000Z",
          characters: [{ ...sheetSync.characters[0], sheet: undefined }],
        },
        headers: serviceAuth,
      });
      assert.deepEqual((await api(mf, sheetPath, { token: identities.playerOne.token })).data.sheet, sheet);

      // Anotações: só o jogador vinculado edita, uma por vez, e o módulo recusa se a descrição mudou.
      const notesPath = `/api/me/characters/${defaultCampaignId}/notes`;
      const notesBody = { text: "Veio do norte.\n\nProcura o irmão.", revision: sheet.notes.revision };
      assert.equal((await api(mf, notesPath, { method: "POST", body: notesBody })).status, 401);
      assert.equal((await api(mf, notesPath, { token: identities.playerTwo.token, method: "POST", body: notesBody })).status, 404);
      const staleNotes = await api(mf, notesPath, {
        token: identities.playerOne.token,
        method: "POST",
        body: { ...notesBody, revision: "outra" },
      });
      assert.equal(staleNotes.status, 409);
      assert.equal(staleNotes.data.error.code, "notes_changed");
      const unchanged = await api(mf, notesPath, {
        token: identities.playerOne.token,
        method: "POST",
        body: { ...notesBody, text: sheet.notes.text },
      });
      assert.equal(unchanged.status, 422);

      const requested = await api(mf, notesPath, { token: identities.playerOne.token, method: "POST", body: notesBody });
      assert.equal(requested.status, 202, JSON.stringify(requested.data));
      // Sem bridge no teste, o envio falha; simulamos o comando já na fila.
      await db.prepare("UPDATE character_note_updates SET status = 'pending_delivery', error = NULL WHERE id = ?").bind(requested.data.id).run();
      const stored = await db.prepare("SELECT text, foundry_actor_id FROM character_note_updates WHERE id = ?").bind(requested.data.id).first();
      assert.deepEqual(stored, { text: notesBody.text, foundry_actor_id: "aster-001" });
      const whilePending = await api(mf, notesPath, { token: identities.playerOne.token, method: "POST", body: notesBody });
      assert.equal(whilePending.status, 409);
      assert.equal(whilePending.data.error.code, "notes_update_pending");

      const notesCallbackPath = "/api/internal/integration/foundry/character-notes/delivery";
      const notesCallback = {
        updateId: requested.data.id,
        commandId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
        outcome: "succeeded",
        conflict: true,
        error: null,
        deliveredAt: "2026-10-03T12:00:00.000Z",
      };
      assert.equal((await api(mf, notesCallbackPath, { method: "POST", body: notesCallback })).status, 401);
      const conflicted = await api(mf, notesCallbackPath, { method: "POST", body: notesCallback, headers: serviceAuth });
      assert.equal(conflicted.status, 200, JSON.stringify(conflicted.data));
      assert.equal(conflicted.data.status, "conflict");
      assert.equal((await api(mf, sheetPath, { token: identities.playerOne.token })).data.notesUpdate.status, "conflict");

      const retried = await api(mf, notesPath, { token: identities.playerOne.token, method: "POST", body: notesBody });
      assert.equal(retried.status, 202, JSON.stringify(retried.data));
      await db.prepare("UPDATE character_note_updates SET status = 'pending_delivery', error = NULL WHERE id = ?").bind(retried.data.id).run();
      const applied = await api(mf, notesCallbackPath, {
        method: "POST",
        body: { ...notesCallback, updateId: retried.data.id, commandId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", conflict: false },
        headers: serviceAuth,
      });
      assert.deepEqual([applied.data.status, applied.data.appliedAt], ["applied", "2026-10-03T12:00:00.000Z"]);

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

    test("protege, acompanha e decide pedidos assistidos do Lojista", async () => {
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

    test("guarda imagens no KV e liga capa e galeria à crônica", async () => {
      const upload = (token: string, bytes: Uint8Array, name = "capa.png") => {
        const form = new MiniflareFormData();
        form.set("file", new Blob([bytes.slice().buffer as ArrayBuffer]), name);
        return mf.dispatchFetch(`${origin}/api/campaigns/${defaultCampaignId}/media`, {
          method: "POST",
          headers: { cookie: `ordem_session=${token}`, "sec-fetch-site": "same-origin" },
          body: form,
        });
      };
      // PNG mínimo: só a assinatura importa para a verificação de tipo.
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3, 4]);

      assert.equal((await upload(identities.playerOne.token, png)).status, 403);
      const fake = await upload(identities.gm.token, new TextEncoder().encode("<svg onload=alert(1)>"), "x.png");
      assert.equal(fake.status, 415);
      const stored = await upload(identities.gm.token, png);
      assert.equal(stored.status, 201, await stored.clone().text());
      const asset = (await stored.json()) as Json;
      assert.deepEqual([asset.contentType, asset.bytes, asset.url], ["image/png", png.length, `/media/${asset.id}`]);

      const served = await mf.dispatchFetch(`${origin}${asset.url}`);
      assert.equal(served.status, 200);
      assert.equal(served.headers.get("content-type"), "image/png");
      assert.equal(served.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(new Uint8Array(await served.arrayBuffer()), png);
      assert.equal((await mf.dispatchFetch(`${origin}/media/00000000-0000-4000-8000-000000000000`)).status, 404);

      const second = (await (await upload(identities.gm.token, png, "galeria.png")).json()) as Json;
      const created = await api(mf, `/api/campaigns/${defaultCampaignId}/posts`, {
        token: identities.gm.token,
        method: "POST",
        body: {
          campaignId: defaultCampaignId,
          title: "Crônica com capa",
          body: "> Escrito por **Corvo**\n\nTexto.",
          coverMediaId: asset.id,
          galleryMediaIds: [second.id],
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.deepEqual([created.data.coverMediaId, created.data.galleryMediaIds], [asset.id, [second.id]]);

      const unknown = await api(mf, `/api/posts/${created.data.id}`, {
        token: identities.gm.token,
        method: "PATCH",
        body: { version: created.data.version, coverMediaId: "00000000-0000-4000-8000-000000000000" },
      });
      assert.equal(unknown.status, 422);
      const cleared = await api(mf, `/api/posts/${created.data.id}`, {
        token: identities.gm.token,
        method: "PATCH",
        body: { version: created.data.version, coverMediaId: null, galleryMediaIds: [] },
      });
      assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
      assert.deepEqual([cleared.data.coverMediaId, cleared.data.galleryMediaIds, cleared.data.title], [null, [], "Crônica com capa"]);

      // Missão com capa e duração; o Discord só recebe missões publicadas e de quem publica.
      const mission = await api(mf, `/api/campaigns/${defaultCampaignId}/missions`, {
        token: identities.gm.token,
        method: "POST",
        body: {
          campaignId: defaultCampaignId,
          title: "Ecos na Floresta",
          summary: "Investigar o desaparecimento de caçadores.",
          region: "Floresta",
          coverMediaId: asset.id,
          estimatedDuration: "1-3 sessões",
        },
      });
      assert.equal(mission.status, 201, JSON.stringify(mission.data));
      assert.deepEqual(
        [mission.data.coverMediaId, mission.data.estimatedDuration, mission.data.discordThreadId],
        [asset.id, "1-3 sessões", null],
      );
      const missionDiscord = `/api/campaigns/${defaultCampaignId}/missions/${mission.data.id}/discord`;
      const discordBody = { forumChannelId: "1536153443985531222", tagIds: [], content: "🎯 Ecos" };
      assert.equal(
        (await api(mf, missionDiscord, { token: identities.playerOne.token, method: "POST", body: discordBody })).status,
        403,
      );
      const draftToDiscord = await api(mf, missionDiscord, { token: identities.owner.token, method: "POST", body: discordBody });
      assert.equal(draftToDiscord.status, 409);
      assert.equal(draftToDiscord.data.error.code, "mission_not_published");

      // Importar do Discord exige quem escreve crônicas; a leitura em si passa pelo Worker do Discord.
      const importBase = `/api/campaigns/${defaultCampaignId}/discord-import`;
      assert.equal((await api(mf, `${importBase}/forums`, { token: identities.playerOne.token })).status, 403);
      const playerImport = await api(mf, importBase, {
        token: identities.playerOne.token,
        method: "POST",
        body: { forumChannelId: "1536153443985531111", threadIds: ["1290000000000000000"] },
      });
      assert.equal(playerImport.status, 403);
      const invalidImport = await api(mf, importBase, {
        token: identities.gm.token,
        method: "POST",
        body: { forumChannelId: "1536153443985531111", threadIds: [] },
      });
      assert.equal(invalidImport.status, 422);
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

      // Seleção manual: itens escolhidos à mão viram uma prévia do mesmo fluxo.
      const selectionsPath = `/api/campaigns/${defaultCampaignId}/merchant/stock/selections`;
      const rope = catalog.data.data.find((item: Json) => item.active && item.id !== longbow.id);
      const selection = { entries: [{ catalogItemId: rope.id, quantity: 4 }] };
      assert.equal(
        (await api(mf, selectionsPath, { token: identities.playerOne.token, method: "POST", body: selection })).status,
        403,
      );
      const repeated = await api(mf, selectionsPath, {
        token: identities.gm.token,
        method: "POST",
        body: { entries: [...selection.entries, ...selection.entries] },
      });
      assert.equal(repeated.status, 422);
      const withInactive = await api(mf, selectionsPath, {
        token: identities.gm.token,
        method: "POST",
        body: { entries: [...selection.entries, { catalogItemId: longbow.id, quantity: 1 }] },
      });
      assert.equal(withInactive.status, 409);
      assert.equal(withInactive.data.error.code, "catalog_items_unavailable");

      const manual = await api(mf, selectionsPath, { token: identities.gm.token, method: "POST", body: selection });
      assert.equal(manual.status, 201, JSON.stringify(manual.data));
      assert.deepEqual(
        [manual.data.mode, manual.data.criteria, manual.data.status, manual.data.entries.length],
        ["manual", null, "preview", 1],
      );
      assert.deepEqual([manual.data.entries[0].catalogItemId, manual.data.entries[0].quantity], [rope.id, 4]);
      const afterSelection = await api(mf, drawsPath, { token: identities.gm.token });
      assert.deepEqual(
        afterSelection.data.data.map((item: Json) => [item.mode, item.status]),
        [
          ["manual", "preview"],
          ["draw", "applied"],
        ],
      );

      // Estoque atual: só as mudanças vão ao Foundry, e o resultado volta por item.
      const patchesPath = `/api/campaigns/${defaultCampaignId}/merchant/stock/patches`;
      const worldId = "22222222-2222-4222-8222-222222222222";
      const patchBody = { worldId, operations: [{ op: "set", itemId: "espada", from: 1, quantity: 3 }] };
      assert.equal(
        (await api(mf, patchesPath, { token: identities.playerOne.token, method: "POST", body: patchBody })).status,
        403,
      );
      const twice = await api(mf, patchesPath, {
        token: identities.gm.token,
        method: "POST",
        body: { worldId, operations: [...patchBody.operations, { op: "remove", itemId: "espada" }] },
      });
      assert.equal(twice.status, 422);
      const noWorld = await api(mf, `/api/campaigns/${defaultCampaignId}/merchant/stock/current`, { token: identities.gm.token });
      assert.equal(noWorld.status, 422);

      const patchId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      await db
        .prepare(
          `INSERT INTO merchant_stock_patches (id, campaign_id, created_by_user_id, world_id, operations_json)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          patchId,
          defaultCampaignId,
          identities.gm.id,
          worldId,
          JSON.stringify([
            { operation: { op: "set", itemId: "espada", from: 1, quantity: 3 }, name: "Espada" },
            { operation: { op: "remove", itemId: "funda" }, name: "Funda" },
          ]),
        )
        .run();
      const patchPath = `${patchesPath}/${patchId}`;
      assert.equal((await api(mf, patchPath, { token: identities.playerOne.token })).status, 403);
      const pendingPatch = await api(mf, patchPath, { token: identities.gm.token });
      assert.equal(pendingPatch.status, 200, JSON.stringify(pendingPatch.data));
      assert.deepEqual(
        [pendingPatch.data.status, pendingPatch.data.operations.map((entry: Json) => entry.outcome)],
        ["pending_delivery", [null, null]],
      );

      const patchCallbackPath = "/api/internal/integration/foundry/merchant-stock/patch-delivery";
      const patchCallback = {
        patchId,
        commandId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        outcome: "succeeded",
        outcomes: ["applied", "conflict"],
        error: null,
        deliveredAt: "2026-10-09T12:00:00.000Z",
      };
      assert.equal((await api(mf, patchCallbackPath, { method: "POST", body: patchCallback })).status, 401);
      const partial = await api(mf, patchCallbackPath, {
        method: "POST",
        body: patchCallback,
        headers: { authorization: "Bearer test-integration-token-with-at-least-32-bytes" },
      });
      assert.equal(partial.status, 200, JSON.stringify(partial.data));
      assert.deepEqual(
        [partial.data.status, partial.data.operations.map((entry: Json) => [entry.name, entry.outcome])],
        [
          "partial",
          [
            ["Espada", "applied"],
            ["Funda", "conflict"],
          ],
        ],
      );
    });

    test("importa o compêndio e mantém a biblioteca de criaturas com RBAC", async () => {
      const base = `/api/campaigns/${defaultCampaignId}`;
      // Documento sintético no formato do export do Foundry; nenhum conteúdo dos livros.
      const creatureFile = {
        _id: "fixture-creature",
        name: "Fera de Teste",
        type: "creature",
        system: {
          attributes: { strength: { value: 12 }, agility: { value: 11 }, intellect: { value: 6 }, will: { value: 9 }, perception: { value: 10 } },
          characteristics: { defense: 13, health: { max: 22 }, speed: 12, size: "1" },
          difficulty: 10,
          descriptor: "Criatura média (fera)",
          description: "<p>Descrição.</p>",
        },
        items: [{ _id: "w1", name: "Mordida", type: "weapon", system: { action: { attack: "+2", against: "defense", damage: "1d6" } } }],
      };
      const spellFile = { _id: "fixture-spell", name: "Clarão", type: "spell", system: { tradition: "Teste", rank: 1 } };
      const importBody = {
        kind: "creature",
        files: [
          { fileName: "Fera.json", content: creatureFile },
          { fileName: "_manifesto.json", content: {} },
          { fileName: "Magia.json", content: spellFile },
        ],
      };

      assert.equal((await api(mf, `${base}/compendium`, { token: identities.playerOne.token })).status, 403);
      assert.equal(
        (await api(mf, `${base}/compendium/import`, { token: identities.playerOne.token, method: "POST", body: importBody })).status,
        403,
      );
      assert.equal((await api(mf, `${base}/creatures`, { token: identities.playerOne.token })).status, 403);

      const imported = await api(mf, `${base}/compendium/import`, { token: identities.gm.token, method: "POST", body: importBody });
      assert.equal(imported.status, 200, JSON.stringify(imported.data));
      assert.equal(imported.data.created, 1);
      assert.deepEqual(imported.data.skipped.map((item: Json) => item.fileName), ["_manifesto.json", "Magia.json"]);
      const reimported = await api(mf, `${base}/compendium/import`, { token: identities.gm.token, method: "POST", body: importBody });
      assert.deepEqual([reimported.data.created, reimported.data.updated], [0, 1]);
      const spells = await api(mf, `${base}/compendium/import`, {
        token: identities.gm.token,
        method: "POST",
        body: { kind: "spell", files: [{ fileName: "Magia.json", content: spellFile }] },
      });
      assert.equal(spells.data.created, 1);

      const bestiary = await api(mf, `${base}/compendium?tipo=creature`, { token: identities.gm.token });
      assert.equal(bestiary.status, 200);
      assert.equal(bestiary.data.data.length, 1);
      const entry = bestiary.data.data[0];
      assert.deepEqual([entry.name, entry.category, entry.difficulty, entry.defense, entry.health], [
        "Fera de Teste",
        "Criatura média (fera)",
        10,
        13,
        22,
      ]);
      assert.equal((await api(mf, `${base}/compendium?tipo=outro`, { token: identities.gm.token })).status, 422);
      const full = await api(mf, `${base}/compendium/${entry.id}`, { token: identities.gm.token });
      assert.equal(full.status, 200);
      assert.equal(full.data.data.items[0].kind, "attack");

      const created = await api(mf, `${base}/creatures`, {
        token: identities.gm.token,
        method: "POST",
        body: { draft: full.data.data, basedOnEntryId: entry.id },
      });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.deepEqual(created.data.basedOn, { entryId: entry.id, name: "Fera de Teste" });
      assert.deepEqual([created.data.version, created.data.status, created.data.sentVersion], [1, "draft", 0]);

      const invalid = await api(mf, `${base}/creatures`, {
        token: identities.gm.token,
        method: "POST",
        body: { draft: { ...full.data.data, image: "../segredo.png" }, basedOnEntryId: null },
      });
      assert.equal(invalid.status, 422);

      const path = `${base}/creatures/${created.data.id}`;
      const draft = { ...created.data.draft, name: "Fera Alfa", health: 30 };
      const stale = await api(mf, path, { token: identities.gm.token, method: "PATCH", body: { draft, version: 2 } });
      assert.equal(stale.status, 409);
      const saved = await api(mf, path, { token: identities.gm.token, method: "PATCH", body: { draft, version: 1 } });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.deepEqual([saved.data.version, saved.data.draft.name, saved.data.draft.health], [2, "Fera Alfa", 30]);

      // O envio real passa pelo bridge; aqui simulamos o comando já na fila.
      await db
        .prepare("UPDATE creatures SET status = 'pending_delivery', sent_version = 2 WHERE id = ?")
        .bind(created.data.id)
        .run();
      const callbackPath = "/api/internal/integration/foundry/creatures/delivery";
      const callback = {
        creatureId: created.data.id,
        version: 2,
        commandId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        outcome: "succeeded",
        actorId: "ActorFoundry01",
        error: null,
        deliveredAt: "2026-09-26T12:00:00.000Z",
      };
      const serviceAuth = { authorization: "Bearer test-integration-token-with-at-least-32-bytes" };
      assert.equal((await api(mf, callbackPath, { method: "POST", body: callback })).status, 401);
      const stalePush = await api(mf, callbackPath, { method: "POST", body: { ...callback, version: 1 }, headers: serviceAuth });
      assert.equal(stalePush.data.status, "pending_delivery");
      const delivered = await api(mf, callbackPath, { method: "POST", body: callback, headers: serviceAuth });
      assert.equal(delivered.status, 200, JSON.stringify(delivered.data));
      assert.deepEqual(
        [delivered.data.status, delivered.data.foundryActorId, delivered.data.sentAt],
        ["synced", "ActorFoundry01", "2026-09-26T12:00:00.000Z"],
      );

      const list = await api(mf, `${base}/creatures`, { token: identities.manager.token });
      assert.equal(list.status, 200);
      assert.deepEqual(list.data.data.map((item: Json) => item.id), [created.data.id]);

      const sameOrigin = { "sec-fetch-site": "same-origin" };
      const forbidden = await api(mf, path, { token: identities.playerOne.token, method: "DELETE", headers: sameOrigin });
      assert.equal(forbidden.status, 403);
      const removed = await api(mf, path, { token: identities.gm.token, method: "DELETE", headers: sameOrigin });
      assert.equal(removed.status, 200);
      assert.equal((await api(mf, path, { token: identities.gm.token })).status, 404);
    });

    test("não deixa automações misturarem Crônicas e Diário de Sessões", async () => {
      const path = `/api/campaigns/${defaultCampaignId}/automations`;
      const source = { kind: "pasted_text", label: "Sessão 12", content: "Registro da mesa. ".repeat(10) };
      const sessionTarget = { type: "session_summary", sessionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" };
      for (const body of [
        // Resumo de sessão sem sessão: iria parar em Crônicas.
        { campaignId: defaultCampaignId, kind: "session_summary", source },
        // Crônica apontando para uma sessão: iria parar no Diário.
        { campaignId: defaultCampaignId, kind: "chronicle_draft", source, target: sessionTarget },
        // Extração de registros não tem tela de destino.
        { campaignId: defaultCampaignId, kind: "record_extraction", source },
      ]) {
        const response = await api(mf, path, { token: identities.gm.token, method: "POST", body });
        assert.equal(response.status, 422, `${body.kind}: ${JSON.stringify(response.data)}`);
        assert.equal(response.data.error.code, "automation_destination_mismatch");
      }

      const sessionDraft = await api(mf, `/api/campaigns/${defaultCampaignId}/sessions/${sessionTarget.sessionId}/draft`, {
        token: identities.gm.token,
        method: "POST",
        body: { kind: "chronicle_draft" },
      });
      // A área Sessões só aceita resumo de sessão; o contrato recusa outros tipos.
      assert.equal(sessionDraft.status, 422);
    });

    test("Vida na Sede: período por inscrição, limite pelo nível e resolução pelo Guardião", async () => {
      const base = `/api/campaigns/${defaultCampaignId}/sede`;
      const sameOrigin = { "sec-fetch-site": "same-origin" };
      const post = (path: string, token: string, body?: unknown) =>
        api(mf, path, { token, method: "POST", ...(body === undefined ? { headers: sameOrigin } : { body }) });

      assert.equal((await api(mf, `${base}/manage`, { token: identities.playerOne.token })).status, 403);
      assert.equal((await post(`${base}/activities/import-base`, identities.playerOne.token)).status, 403);
      const imported = await post(`${base}/activities/import-base`, identities.gm.token);
      assert.deepEqual(imported.data, { created: 7, skipped: 0 });
      assert.deepEqual((await post(`${base}/activities/import-base`, identities.gm.token)).data, { created: 0, skipped: 7 });

      // Sem personagem vinculado, o jogador vê a Sede mas não escolhe.
      const unlinked = await api(mf, base, { token: identities.playerOne.token });
      assert.equal(unlinked.status, 200, JSON.stringify(unlinked.data));
      assert.equal(unlinked.data.actorName, null);
      const escriba = unlinked.data.activities.find((activity: Json) => activity.npc === "Escriba");
      const zelador = unlinked.data.activities.find((activity: Json) => activity.npc === "Zelador");
      const criativa = unlinked.data.activities.find((activity: Json) => activity.name === "Atividade Criativa");
      assert.equal(criativa.inputMode, "intent");
      assert.equal((await post(`${base}/declarations`, identities.playerOne.token, { activityId: escriba.id, note: "Quem é o Rei?" })).status, 409);

      const link = await api(mf, `/api/campaigns/${defaultCampaignId}/members/${identities.playerOne.id}/character-link`, {
        token: identities.gm.token,
        method: "PUT",
        body: { worldId: "22222222-2222-4222-8222-222222222222", actorId: "aster-001" },
      });
      assert.equal(link.status, 200, JSON.stringify(link.data));
      assert.equal(link.data.registro, null);

      // Tópico do Corvo no Registro do Corvo (Discord).
      const registroPath = `/api/campaigns/${defaultCampaignId}/members/${identities.playerOne.id}/character-link/registro`;
      const threadUrl = "https://discord.com/channels/1529124400694300702/1536160000000000000";
      assert.equal((await api(mf, registroPath, { token: identities.playerOne.token, method: "PUT", body: { thread: threadUrl } })).status, 403);
      const invalidThread = await api(mf, registroPath, { token: identities.gm.token, method: "PUT", body: { thread: "https://example.com/x" } });
      assert.equal(invalidThread.status, 422);
      const registro = await api(mf, registroPath, { token: identities.gm.token, method: "PUT", body: { thread: threadUrl } });
      assert.equal(registro.status, 200, JSON.stringify(registro.data));
      assert.deepEqual(registro.data.registro, { threadId: "1536160000000000000", guildId: "1529124400694300702" });

      const state = await api(mf, base, { token: identities.playerOne.token });
      assert.deepEqual([state.data.level, state.data.actorName, state.data.period.remaining], [1, "Aster", 1]);
      assert.equal(state.data.activities.length, 7);

      const noQuestion = await post(`${base}/declarations`, identities.playerOne.token, { activityId: escriba.id, note: null });
      assert.equal(noQuestion.status, 422);
      const noIntent = await post(`${base}/declarations`, identities.playerOne.token, { activityId: criativa.id, note: "  " });
      assert.equal(noIntent.status, 422);
      assert.equal(noIntent.data.error.code, "sede_intent_required");
      const research = await post(`${base}/declarations`, identities.playerOne.token, {
        activityId: escriba.id,
        note: "Quem fundou a Ordem?",
      });
      assert.equal(research.status, 201, JSON.stringify(research.data));
      assert.deepEqual([research.data.activity.name, research.data.note, research.data.status], [
        "Pesquisa",
        "Quem fundou a Ordem?",
        "declared",
      ]);
      assert.equal(research.data.activity.inputMode, "question");
      const overLimit = await post(`${base}/declarations`, identities.playerOne.token, { activityId: zelador.id, note: null });
      assert.equal(overLimit.status, 409);
      assert.equal(overLimit.data.error.code, "sede_allowance_used");

      // Sede nível 2: duas atividades por período, sem repetir.
      const level = await api(mf, `${base}/settings`, { token: identities.gm.token, method: "PUT", body: { level: 2 } });
      assert.equal(level.status, 200, JSON.stringify(level.data));
      const repeated = await post(`${base}/declarations`, identities.playerOne.token, { activityId: escriba.id, note: "De novo?" });
      assert.equal(repeated.data.error.code, "sede_activity_repeated");
      const chores = await post(`${base}/declarations`, identities.playerOne.token, { activityId: zelador.id, note: null });
      assert.equal(chores.status, 201, JSON.stringify(chores.data));
      assert.equal(chores.data.roll.formula, "2d20");
      assert.equal(chores.data.roll.dice.length, 2);
      assert.ok(chores.data.roll.total >= 2 && chores.data.roll.total <= 40);

      const manage = await api(mf, `${base}/manage`, { token: identities.gm.token });
      assert.equal(manage.status, 200, JSON.stringify(manage.data));
      assert.deepEqual(manage.data.pending.map((entry: Json) => entry.activity.npc), ["Escriba", "Zelador"]);
      assert.equal(manage.data.pending[0].playerName.length > 0, true);
      assert.equal(manage.data.pending.every((entry: Json) => entry.registroLinked === true), true);

      assert.equal((await post(`${base}/declarations/${chores.data.id}/resolve`, identities.playerOne.token, { result: "x" })).status, 403);
      const resolved = await post(`${base}/declarations/${chores.data.id}/resolve`, identities.gm.token, {
        result: "Encontrou uma chave antiga atrás de uma tapeçaria.",
      });
      assert.equal(resolved.status, 200, JSON.stringify(resolved.data));
      assert.equal(resolved.data.status, "resolved");

      assert.equal((await post(`${base}/declarations/${research.data.id}/cancel`, identities.playerTwo.token)).status, 404);
      assert.equal((await post(`${base}/declarations/${chores.data.id}/cancel`, identities.playerOne.token)).status, 409);
      const cancelled = await post(`${base}/declarations/${research.data.id}/cancel`, identities.playerOne.token);
      assert.equal(cancelled.data.status, "cancelled");

      // A inscrição numa missão encerra o período; o resolvido vai para o histórico.
      const mission = await db
        .prepare("SELECT id FROM missions WHERE campaign_id = ? AND status = 'published' LIMIT 1")
        .bind(defaultCampaignId)
        .first<{ id: string }>();
      await db
        .prepare(
          `INSERT INTO mission_signups (mission_id, user_id, status, created_at, updated_at)
           VALUES (?, ?, 'confirmed', datetime('now', '+2 seconds'), datetime('now', '+2 seconds'))
           ON CONFLICT(mission_id, user_id) DO UPDATE SET status = 'confirmed', created_at = excluded.created_at`,
        )
        .bind(mission?.id, identities.playerOne.id)
        .run();
      const nextPeriod = await api(mf, base, { token: identities.playerOne.token });
      assert.deepEqual([nextPeriod.data.period.used, nextPeriod.data.period.remaining], [0, 2]);
      assert.deepEqual(nextPeriod.data.history.map((entry: Json) => [entry.activity.npc, entry.result]), [
        ["Zelador", "Encontrou uma chave antiga atrás de uma tapeçaria."],
      ]);
      assert.equal(nextPeriod.data.activities.every((activity: Json) => activity.chosenThisPeriod === false), true);

      // Lojista: itens Comuns do catálogo até 1 xelim de prata, entregues pelo módulo depois da resolução.
      const lojista = nextPeriod.data.activities.find((activity: Json) => activity.npc === "Lojista");
      assert.deepEqual([lojista.inputMode, lojista.shopLimit], ["shop", "1 ss"]);
      const shop = await api(mf, `${base}/activities/${lojista.id}/shop`, { token: identities.playerOne.token });
      assert.equal(shop.status, 200, JSON.stringify(shop.data));
      assert.equal(shop.data.limitBits, 100);
      assert.ok(shop.data.items.length > 0);
      assert.equal(shop.data.items.every((item: Json) => item.priceBits > 0 && item.priceBits <= 100), true);
      const priciest = [...shop.data.items].sort((a: Json, b: Json) => b.priceBits - a.priceBits)[0];
      const noItems = await post(`${base}/declarations`, identities.playerOne.token, { activityId: lojista.id, note: null, items: [] });
      assert.equal(noItems.data.error.code, "sede_items_required");
      const overLimitItems = await post(`${base}/declarations`, identities.playerOne.token, {
        activityId: lojista.id,
        note: null,
        items: [{ catalogItemId: priciest.catalogItemId, quantity: Math.floor(100 / priciest.priceBits) + 1 }],
      });
      assert.equal(overLimitItems.data.error.code, "sede_items_over_limit");
      const supplies = await post(`${base}/declarations`, identities.playerOne.token, {
        activityId: lojista.id,
        note: null,
        items: [{ catalogItemId: priciest.catalogItemId, quantity: 1 }],
      });
      assert.equal(supplies.status, 201, JSON.stringify(supplies.data));
      assert.deepEqual([supplies.data.items.length, supplies.data.items[0].quantity, supplies.data.delivery], [1, 1, null]);
      assert.ok(supplies.data.itemsTotal);

      // Sem bridge no teste, a entrega falha com a explicação; o reenvio tenta de novo.
      const suppliesResolved = await post(`${base}/declarations/${supplies.data.id}/resolve`, identities.gm.token, {
        result: "O Lojista separou os suprimentos.",
      });
      assert.equal(suppliesResolved.status, 200, JSON.stringify(suppliesResolved.data));
      assert.equal(suppliesResolved.data.delivery.status, "failed");
      assert.equal((await post(`${base}/declarations/${supplies.data.id}/deliver`, identities.playerOne.token)).status, 403);
      const retried = await post(`${base}/declarations/${supplies.data.id}/deliver`, identities.gm.token);
      assert.equal(retried.status, 200, JSON.stringify(retried.data));

      await db.prepare("UPDATE sede_declarations SET delivery_status = 'pending_delivery' WHERE id = ?").bind(supplies.data.id).run();
      const grantCallback = {
        declarationId: supplies.data.id,
        commandId: "ffffffff-ffff-4fff-8fff-fffffffffff1",
        outcome: "succeeded",
        error: null,
        deliveredAt: "2026-10-03T13:00:00.000Z",
      };
      const grantPath = "/api/internal/integration/foundry/sede-grants/delivery";
      assert.equal((await api(mf, grantPath, { method: "POST", body: grantCallback })).status, 401);
      const granted = await api(mf, grantPath, {
        method: "POST",
        body: grantCallback,
        headers: { authorization: "Bearer test-integration-token-with-at-least-32-bytes" },
      });
      assert.equal(granted.status, 200, JSON.stringify(granted.data));
      assert.deepEqual([granted.data.delivery.status, granted.data.delivery.deliveredAt], ["delivered", "2026-10-03T13:00:00.000Z"]);

      const shopWithoutLimit = await post(`${base}/activities`, identities.gm.token, {
        npc: "Ferreiro",
        name: "Encomenda",
        description: "Pede uma peça ao ferreiro.",
        effect: "Recebe uma peça.",
        minLevel: 2,
        inputMode: "shop",
      });
      assert.equal(shopWithoutLimit.status, 422);
      assert.equal(shopWithoutLimit.data.error.code, "sede_shop_limit_invalid");

      const unlink = await api(mf, `/api/campaigns/${defaultCampaignId}/members/${identities.playerOne.id}/character-link`, {
        token: identities.gm.token,
        method: "DELETE",
      });
      assert.equal(unlink.status, 200);
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
        "merchant.stock.selected",
        "media.uploaded",
        "character.notes.requested",
        "character.notes.conflict",
        "character.notes.applied",
        "sede.activity_type.imported",
        "sede.activity.declared",
        "sede.level.updated",
        "sede.activity.resolved",
        "sede.activity.cancelled",
        "character.registro.linked",
        "sede.items.redelivered",
        "sede.items.delivered",
        "compendium.imported",
        "creature.created",
        "creature.updated",
        "creature.synced",
        "creature.deleted",
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
