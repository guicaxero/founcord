import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { MissionBoard } from "@/components/mission-board";
import { PublishedPosts } from "@/components/published-posts";
import { ResponsiveNavigation } from "@/components/responsive-navigation";
import { DEFAULT_CAMPAIGN_ID } from "@/server/constants";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="site-shell" id="main-content">
      <aside className="brand-rail" aria-label="Identidade da campanha">
        <div className="sigil" aria-hidden="true">O</div>
        <span>WM</span>
        <div className="rail-line" />
        <span>SDL</span>
      </aside>
      <div className="page-frame">
        <header className="topbar">
          <a className="wordmark" href="#inicio" aria-label="Ir para o início">
            <span>Ordem da</span><strong>Última Luz</strong>
          </a>
          <ResponsiveNavigation
            label="Navegação principal"
            menuLabel="Explorar portal"
            items={[
              { href: "#quadro", label: "Missões", current: true },
              { href: "/ordem", label: "Código da Ordem" },
              { href: "#cronicas", label: "Crônicas" },
            ]}
          />
          <AccountMenu />
        </header>

        <section className="hero" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow">West Marches <span>•</span> Shadow of the Demon Lord</p>
            <h1>Enquanto houver luz,<br />haverá <em>esperança.</em></h1>
            <p className="hero-description">
              Uma Ordem para aqueles dispostos a enfrentar a escuridão — qualquer
              que seja sua origem — e proteger o que ainda merece permanecer de pé.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#quadro">
                Ver chamados <span aria-hidden="true">→</span>
              </a>
              <span className="world-status"><i aria-hidden="true" /> A chama permanece</span>
            </div>
          </div>
          <div className="campaign-seal" aria-hidden="true">
            <span className="seal-kicker">Ano imperial</span>
            <strong>888</strong>
            <span>Depois da Fundação</span>
          </div>
        </section>

        <section className="content-grid" id="quadro">
          <div className="mission-board">
            <div className="section-heading">
              <div><p className="section-index">01 / QUADRO</p><h2>Chamados da Ordem</h2></div>
              <span className="filter-button">Missões publicadas</span>
            </div>
            <MissionBoard campaignId={DEFAULT_CAMPAIGN_ID} initialMissions={[]} />
          </div>
          <aside className="campaign-panel" id="campanha">
            <div className="section-heading compact">
              <div><p className="section-index">02 / URTH</p><h2>O mundo agora</h2></div>
            </div>
            <div className="world-card">
              <p className="world-card-label">Uma das cinco verdades de Rûl</p>
              <h3>O Império está em crise</h3>
              <p>
                A morte do imperador espalhou revoltas, guerras e disputas por poder.
                Muitos acreditam que uma grande mudança está por vir.
              </p>
            </div>
            <dl className="campaign-stats">
              <div><dt>Sessões planejadas</dt><dd>1×</dd><small>por semana</small></div>
              <div><dt>Grupo mínimo</dt><dd>3</dd><small>integrantes</small></div>
              <div><dt>Duração mínima</dt><dd>3h</dd><small>por sessão</small></div>
            </dl>
            <div className="chronicle">
              <span>Crônica da fundação</span><p>“A Chama que Permaneceu”</p>
              <span>Guardião da Chama AP</span>
            </div>
          </aside>
        </section>

        <section className="order-preview" id="ordem">
          <div className="order-preview-heading">
            <div>
              <p className="section-index">03 / A ORDEM</p>
              <h2>Uma história compartilhada.<br />Consequências reais.</h2>
            </div>
            <blockquote>
              “A última luz não pertence a um homem. Ela pertence àqueles que
              decidiram mantê-la acesa.”
            </blockquote>
          </div>
          <div className="order-preview-grid">
            <article><span>I—VII</span><h3>Código da Ordem</h3><p>Conduta à mesa, compromisso com missões, respeito e responsabilidade coletiva.</p></article>
            <article><span>GRAUS</span><h3>Progressão</h3><p>Níveis, missões realizadas, promoções e a origem narrativa de cada nova Trilha.</p></article>
            <article><span>PROTOCOLO</span><h3>Antes e depois</h3><p>Inscrições, chamadas, grupos mínimos e a distribuição transparente de tesouros.</p></article>
          </div>
          <Link className="text-action" href="/ordem">Consultar o Código completo <span aria-hidden="true">→</span></Link>
        </section>

        <PublishedPosts campaignId={DEFAULT_CAMPAIGN_ID} initialPosts={[]} />
        <footer>
          <span>Uma campanha comunitária, sem fins lucrativos.</span>
          <span>Enquanto houver luz, haverá esperança.</span>
        </footer>
      </div>
    </main>
  );
}
