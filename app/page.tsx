import { AccountMenu } from "@/components/account-menu";
import { MissionBoard } from "@/components/mission-board";
import { PublishedPosts } from "@/components/published-posts";
import { DEFAULT_CAMPAIGN_ID } from "@/server/constants";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="site-shell">
      <aside className="brand-rail" aria-label="Identidade da campanha">
        <div className="sigil" aria-hidden="true">V</div>
        <span>WM</span>
        <div className="rail-line" />
        <span>SDL</span>
      </aside>
      <div className="page-frame">
        <header className="topbar">
          <a className="wordmark" href="#inicio" aria-label="Ir para o início">
            <span>Vigília do</span><strong>Último Farol</strong>
          </a>
          <nav aria-label="Navegação principal">
            <a className="nav-link is-active" href="#quadro">Missões</a>
            <a className="nav-link" href="#campanha">Campanha</a>
            <a className="nav-link" href="#cronicas">Crônicas</a>
          </nav>
          <AccountMenu />
        </header>

        <section className="hero" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow">West Marches <span>•</span> Shadow of the Demon Lord</p>
            <h1>Os ermos não esperam<br />por <em>heróis.</em></h1>
            <p className="hero-description">
              Escolha um rumor, reúna uma companhia e deixe sua marca em um mundo
              que continua mudando — mesmo quando você não está olhando.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#quadro">
                Explorar missões <span aria-hidden="true">→</span>
              </a>
              <span className="world-status"><i aria-hidden="true" /> Mundo ativo</span>
            </div>
          </div>
          <div className="campaign-seal" aria-hidden="true">
            <span className="seal-kicker">Ano da Ruína</span>
            <strong>17</strong>
            <span>O farol ainda arde</span>
          </div>
        </section>

        <section className="content-grid" id="quadro">
          <div className="mission-board">
            <div className="section-heading">
              <div><p className="section-index">01 / QUADRO</p><h2>Chamados em aberto</h2></div>
              <span className="filter-button">Dados vivos da campanha</span>
            </div>
            <MissionBoard campaignId={DEFAULT_CAMPAIGN_ID} initialMissions={[]} />
          </div>
          <aside className="campaign-panel" id="campanha">
            <div className="section-heading compact">
              <div><p className="section-index">02 / CAMPANHA</p><h2>O mundo agora</h2></div>
            </div>
            <div className="world-card">
              <p className="world-card-label">Presságio vigente</p>
              <h3>A lua sangra sobre o poente</h3>
              <p>Testes de Vontade recebem uma perdição nas terras além do Rio Negro.</p>
            </div>
            <dl className="campaign-stats">
              <div><dt>Companhias formadas</dt><dd>—</dd></div>
              <div><dt>Regiões reveladas</dt><dd>07</dd></div>
              <div><dt>Expedições concluídas</dt><dd>13</dd></div>
            </dl>
            <div className="chronicle">
              <span>Última crônica</span><p>“Cinzas no pomar de Corven”</p>
              <time dateTime="2026-08-18">18 de agosto</time>
            </div>
          </aside>
        </section>
        <PublishedPosts campaignId={DEFAULT_CAMPAIGN_ID} initialPosts={[]} />
        <footer>
          <span>Uma campanha comunitária, sem fins lucrativos.</span>
          <span>O mundo se lembra.</span>
        </footer>
      </div>
    </main>
  );
}
