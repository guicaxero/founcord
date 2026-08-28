import { permissions } from "@vigilia/authz";
import type {
  CampaignListResponse,
  CurrentUserResponse,
  PostListResponse,
} from "@vigilia/contracts";
import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/admin/dashboard-client";

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
    description: "Campanha comunitária West Marches em Shadow of the Demon Lord.",
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
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }],
};

export default function UiFoundationPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <DashboardClient
      initialMe={previewUser}
      initialCampaigns={previewCampaigns}
      initialEditorialPosts={previewPosts}
    />
  );
}
