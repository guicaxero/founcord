import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { MissionBoard } from "@/components/mission-board";
import { PageHeader } from "@/components/ui/surface";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Missões",
  description: "Chamados publicados da Ordem da Última Luz, com inscrições e lista de espera.",
};

export default function MissionsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Quadro"
        title="Chamados da Ordem"
        description="Missões publicadas para a campanha. Entre com o Discord para confirmar presença; quando uma missão lota, a inscrição vira lista de espera."
      />
      <MissionBoard campaignId={DEFAULT_CAMPAIGN_ID} initialMissions={[]} />
    </PageContainer>
  );
}
