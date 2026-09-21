import { notFound } from "next/navigation";
import { PlayerCharacters } from "@/components/player-characters";
import { previewPlayerCharacters } from "../character-fixtures";

export default function PlayerCharacterPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="character-page" id="main-content">
      <header className="character-hero">
        <div>
          <p className="eyebrow">Área do jogador <span>•</span> Identidade integrada</p>
          <h1>Meu personagem</h1>
          <p>Consulte a ficha resumida associada à sua conta e acompanhe a sincronização com o Foundry.</p>
        </div>
        <div className="character-hero-mark" aria-hidden="true">◇</div>
      </header>
      <section className="player-character-workspace" aria-labelledby="preview-character-title">
        <div className="merchant-heading">
          <div>
            <p className="section-index">01 / PERSONAGEM</p>
            <h2 id="preview-character-title">Vínculos ativos</h2>
          </div>
        </div>
        <PlayerCharacters initialCharacters={previewPlayerCharacters} />
      </section>
    </main>
  );
}
