import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { MerchantCatalog } from "@/components/merchant-catalog";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

const description =
  "Consulte os itens, preços e quantidades disponíveis no Mercador da Ordem da Última Luz.";

export const metadata: Metadata = {
  title: "Mercador",
  description,
  openGraph: { title: "Mercador — Ordem da Última Luz", description },
};

export const dynamic = "force-dynamic";

export default function MerchantPage() {
  return (
    <PageContainer className="merchant-page">
      <MerchantCatalog campaignId={DEFAULT_CAMPAIGN_ID} />
    </PageContainer>
  );
}
