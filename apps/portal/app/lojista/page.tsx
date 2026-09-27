import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { MerchantCatalog } from "@/components/merchant/merchant-catalog";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

const description =
  "Consulte os itens, preços e quantidades disponíveis no Lojista da Ordem da Última Luz.";

export const metadata: Metadata = {
  title: "Lojista",
  description,
  openGraph: { title: "Lojista — Ordem da Última Luz", description },
};

export const dynamic = "force-dynamic";

export default function MerchantPage() {
  return (
    <PageContainer>
      <MerchantCatalog campaignId={DEFAULT_CAMPAIGN_ID} />
    </PageContainer>
  );
}
