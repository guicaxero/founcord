import { notFound } from "next/navigation";
import { PageContainer, Section } from "@/components/layout/page-container";
import { PlayerCharacters } from "@/components/player-characters";
import { PageHeader } from "@/components/ui/surface";
import { previewPlayerCharacters } from "../character-fixtures";

export default function PlayerCharacterPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Prévia de desenvolvimento"
        title="Meu personagem"
        description="Ficha resumida com dados locais, para revisar estados sem depender do Foundry."
      />
      <Section title="Vínculos ativos" id="preview-character">
        <PlayerCharacters initialCharacters={previewPlayerCharacters} />
      </Section>
    </PageContainer>
  );
}
