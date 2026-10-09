import { permissions } from "@ordem/authz";
import type {
  CampaignListResponse,
  CampaignSessionListResponse,
  CurrentUserResponse,
  PostListResponse,
  SessionSummaryListResponse,
} from "@ordem/contracts";
import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/admin/dashboard-client";
import {
  previewCharacterLinks,
  previewCharacterMembers,
  previewCharacterWorlds,
} from "../../character-fixtures";

const campaignId = "11111111-1111-4111-8111-111111111111";

const previewUser: CurrentUserResponse = {
  authenticated: true,
  user: {
    id: "22222222-2222-4222-8222-222222222222",
    discordUserId: "preview-only",
    displayName: "Guardião da Chama AP",
    avatarUrl: null,
  },
  capabilities: permissions.map((permission) => ({
    permission,
    scopeKind: "global" as const,
    scopeId: "*",
  })),
  assignments: [{ roleName: "owner", scopeKind: "global", scopeId: "*" }],
};

const previewCampaigns: CampaignListResponse = {
  data: [{
    id: campaignId,
    slug: "ordem-da-ultima-luz",
    name: "Ordem da Última Luz",
    description: "Campanha comunitária de Shadow of the Demon Lord.",
    status: "active",
    isPublic: true,
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }],
};

const previewPosts: PostListResponse = {
  data: [{
    id: "33333333-3333-4333-8333-333333333333",
    campaignId,
    authorUserId: previewUser.user!.id,
    authorName: previewUser.user!.displayName,
    title: "A Chama que Permaneceu",
    body: "Registro oficial preservado para validar o fluxo editorial.",
    status: "archived",
    source: "manual",
    reviewedBy: previewUser.user!.id,
    publishedAt: "2026-08-01T00:00:00.000Z",
    coverMediaId: null,
    galleryMediaIds: [],
    discordThreadId: null,
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }],
};

const previewSessions: CampaignSessionListResponse = {
  data: [{
    id: "55555555-5555-4555-8555-555555555555",
    campaignId,
    title: "O sino sob a lama",
    status: "ended",
    mission: { id: "66666666-6666-4666-8666-666666666666", title: "Sinos sob a lama" },
    master: { id: previewUser.user!.id, name: previewUser.user!.displayName },
    foundry: null,
    discordReference: null,
    discordImported: false,
    notes: "Fontes revisadas para a prévia visual.",
    automationJobId: null,
    postId: null,
    summaryId: "77777777-7777-4777-8777-777777777777",
    startedAt: "2026-08-29T22:00:00.000Z",
    endedAt: "2026-08-30T01:30:00.000Z",
    createdAt: "2026-08-29T21:45:00.000Z",
    updatedAt: "2026-08-30T01:30:00.000Z",
    version: 3,
  }],
};

const previewSummaries: SessionSummaryListResponse = {
  data: [
    {
      id: "77777777-7777-4777-8777-777777777777",
      campaignId,
      sessionId: previewSessions.data[0]!.id,
      sessionTitle: previewSessions.data[0]!.title,
      mission: previewSessions.data[0]!.mission,
      authorUserId: previewUser.user!.id,
      authorName: previewUser.user!.displayName,
      title: "O sino sob a lama",
      body: "A expedição alcançou a capela afundada e interrompeu o ritual antes do terceiro toque.",
      status: "pending_review",
      source: "automation",
      reviewedBy: null,
      publishedAt: null,
      version: 1,
      createdAt: "2026-08-30T01:40:00.000Z",
      updatedAt: "2026-08-30T01:40:00.000Z",
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      campaignId,
      sessionId: null,
      sessionTitle: null,
      mission: null,
      authorUserId: previewUser.user!.id,
      authorName: previewUser.user!.displayName,
      title: "Registro sem vínculo",
      body: "Um rascunho manual preservado para validar estados e ações destrutivas.",
      status: "archived",
      source: "manual",
      reviewedBy: null,
      publishedAt: null,
      version: 2,
      createdAt: "2026-08-28T18:00:00.000Z",
      updatedAt: "2026-08-30T02:00:00.000Z",
    },
  ],
};

/** Prévia do painel com dados locais; cada área abre em `/dev/ui-foundation/[area]`. */
export default async function UiFoundationPreviewPage({
  params,
}: Readonly<{ params: Promise<{ area?: string[] }> }>) {
  if (process.env.NODE_ENV !== "development") notFound();
  const [area = "personagens"] = (await params).area ?? [];

  return (
    <DashboardClient
      area={area}
      basePath="/dev/ui-foundation"
      initialMe={previewUser}
      initialCampaigns={previewCampaigns}
      initialEditorialPosts={previewPosts}
      initialSessionSummaries={previewSummaries}
      initialSessions={previewSessions}
      initialCharacterMembers={previewCharacterMembers}
      initialCharacterLinks={previewCharacterLinks}
      initialCharacterWorlds={previewCharacterWorlds}
    />
  );
}
