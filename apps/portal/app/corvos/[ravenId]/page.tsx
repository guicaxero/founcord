import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { RavenSheet } from "@/components/ravens/raven-sheet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corvo",
  description: "A ficha de um Corvo da Ordem da Última Luz.",
};

export default async function RavenPage({ params }: Readonly<{ params: Promise<{ ravenId: string }> }>) {
  const { ravenId } = await params;
  return (
    <PageContainer>
      <RavenSheet ravenId={ravenId} />
    </PageContainer>
  );
}
