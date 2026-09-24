import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { PublishedPosts } from "@/components/published-posts";
import { PageHeader } from "@/components/ui/surface";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crônicas",
  description: "Publicações revisadas da Ordem da Última Luz.",
};

export default function ChroniclesPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Editorial"
        title="Crônicas"
        description="Relatos, lore e comunicados publicados após revisão humana."
      />
      <PublishedPosts campaignId={DEFAULT_CAMPAIGN_ID} initialPosts={[]} />
    </PageContainer>
  );
}
