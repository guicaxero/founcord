import type { Metadata } from "next";
import { ChronicleDetail } from "@/components/editorial/chronicles";
import { PageContainer } from "@/components/layout/page-container";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crônica",
  description: "Uma crônica publicada pela Ordem da Última Luz.",
};

export default async function ChronicleDetailPage({
  params,
}: Readonly<{ params: Promise<{ postId: string }> }>) {
  const { postId } = await params;
  return (
    <PageContainer>
      <ChronicleDetail postId={postId} campaignId={DEFAULT_CAMPAIGN_ID} />
    </PageContainer>
  );
}
