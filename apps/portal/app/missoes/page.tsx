import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { MissionBoard } from "@/components/missions/mission-board";
import { MissionsNav } from "@/components/missions/missions-nav";
import { PageHeader } from "@/components/ui/surface";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Missões",
  description: "Chamados abertos da Ordem da Última Luz, com inscrições e lista de espera.",
};

export default function MissionsPage() {
  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Quadro"
          title="Chamados da Ordem"
          description="Missões abertas a inscrição. Entre com o Discord para confirmar presença; quando uma missão lota, a inscrição vira lista de espera."
        />
        <MissionsNav />
      </div>
      <MissionBoard campaignId={DEFAULT_CAMPAIGN_ID} showFilters />
    </PageContainer>
  );
}
