import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { SessionSummaries } from "@/components/session-summaries";
import { PageHeader } from "@/components/ui/surface";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diário de Sessões",
  description: "Registros factuais das sessões jogadas pela Ordem da Última Luz.",
};

export default function SessionDiaryPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Registro"
        title="Diário de Sessões"
        description="O que aconteceu em cada noite de jogo, ligado à sessão e à missão correspondentes."
      />
      <SessionSummaries campaignId={DEFAULT_CAMPAIGN_ID} initialSummaries={[]} />
    </PageContainer>
  );
}
