import type { Metadata } from "next";
import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { PlayerCharacters } from "@/components/player-characters";
import { ResponsiveNavigation } from "@/components/responsive-navigation";

export const metadata: Metadata = {
  title: "Meu personagem",
  description: "Consulte o personagem vinculado à sua conta na Ordem da Última Luz.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function CharacterPage() {
  return (
    <main className="site-shell" id="main-content">
      <aside className="brand-rail" aria-label="Identidade da campanha">
        <div className="sigil" aria-hidden="true">O</div>
        <span>WM</span>
        <div className="rail-line" />
        <span>SDL</span>
      </aside>

      <div className="page-frame character-page">
        <header className="topbar">
          <Link className="wordmark" href="/" aria-label="Voltar ao portal">
            <span>Ordem da</span><strong>Última Luz</strong>
          </Link>
          <ResponsiveNavigation
            label="Navegação principal"
            menuLabel="Explorar portal"
            items={[
              { href: "/#quadro", label: "Missões" },
              { href: "/ordem", label: "Código da Ordem" },
              { href: "/#cronicas", label: "Crônicas" },
              { href: "/mercador", label: "Mercador" },
              { href: "/personagem", label: "Meu personagem", current: true },
            ]}
          />
          <AccountMenu />
        </header>

        <header className="character-hero">
          <div>
            <p className="eyebrow">Área do jogador <span>•</span> Identidade integrada</p>
            <h1>Meu personagem</h1>
            <p>
              Consulte a ficha resumida associada à sua conta e acompanhe quando os dados foram recebidos do Foundry.
            </p>
          </div>
          <div className="character-hero-mark" aria-hidden="true">◇</div>
        </header>

        <section className="player-character-workspace" aria-labelledby="my-characters-heading">
          <div className="merchant-heading">
            <div>
              <p className="section-index">01 / PERSONAGEM</p>
              <h2 id="my-characters-heading">Vínculos ativos</h2>
            </div>
          </div>
          <PlayerCharacters />
        </section>

        <footer>
          <span>Uma campanha comunitária, sem fins lucrativos.</span>
          <span>Enquanto houver luz, haverá esperança.</span>
        </footer>
      </div>
    </main>
  );
}
