import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerArea } from "@/components/player-area";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader, Skeleton } from "@/components/ui/surface";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Minha área",
  description: "Personagem vinculado, inscrições e pedidos do Lojista.",
  robots: { index: false, follow: false },
};

export default function PlayerAreaPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Área do jogador"
        title="Minha área"
        description="Tudo que é seu na campanha: o personagem vinculado ao Foundry, suas inscrições e seus pedidos ao Lojista."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <PlayerArea />
      </Suspense>
    </PageContainer>
  );
}
