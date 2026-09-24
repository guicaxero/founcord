import type { Metadata } from "next";
import { MissionDetail } from "@/components/missions/mission-detail";
import { PageContainer } from "@/components/layout/page-container";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chamado",
  description: "Detalhes de um chamado da Ordem da Última Luz.",
};

export default async function MissionDetailPage({
  params,
}: Readonly<{ params: Promise<{ missionId: string }> }>) {
  const { missionId } = await params;
  return (
    <PageContainer>
      <MissionDetail missionId={missionId} />
    </PageContainer>
  );
}
