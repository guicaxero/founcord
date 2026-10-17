import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { RavenRegistry } from "@/components/ravens/raven-registry";
import { PageHeader } from "@/components/ui/surface";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Registro dos Corvos",
  description: "Os Corvos da Ordem da Última Luz: identificação, progresso, Vida na Sede e atributos.",
};

export default function RavenRegistryPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Catálogo da Ordem"
        title="Registro dos Corvos"
        description="Todos os personagens da campanha, com o que já viveram nas missões e na Sede."
      />
      <RavenRegistry campaignId={DEFAULT_CAMPAIGN_ID} />
    </PageContainer>
  );
}
