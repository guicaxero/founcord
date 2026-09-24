import type { Metadata } from "next";
import { DiaryEntryDetail } from "@/components/editorial/diary";
import { PageContainer } from "@/components/layout/page-container";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Registro de sessão",
  description: "Um registro do diário de sessões da Ordem da Última Luz.",
};

export default async function DiaryDetailPage({
  params,
}: Readonly<{ params: Promise<{ summaryId: string }> }>) {
  const { summaryId } = await params;
  return (
    <PageContainer>
      <DiaryEntryDetail summaryId={summaryId} campaignId={DEFAULT_CAMPAIGN_ID} />
    </PageContainer>
  );
}
