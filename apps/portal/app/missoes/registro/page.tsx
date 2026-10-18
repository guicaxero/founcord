import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { MissionRegistry } from "@/components/missions/mission-registry";
import { MissionsNav } from "@/components/missions/missions-nav";
import { PageHeader } from "@/components/ui/surface";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Registro de missões",
  description: "O arquivo das missões da Ordem da Última Luz: em andamento, concluídas e fracassadas.",
};

export default function MissionRegistryPage() {
  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Arquivo"
          title="Registro de missões"
          description="Cada missão que a Ordem enviou: as que ainda estão em andamento, as concluídas e as que fracassaram. Para se inscrever, use os chamados abertos."
        />
        <MissionsNav />
      </div>
      <MissionRegistry campaignId={DEFAULT_CAMPAIGN_ID} />
    </PageContainer>
  );
}
