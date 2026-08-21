const missions = [
  {
    urgency: "Urgente",
    title: "Sinos sob a lama",
    summary:
      "Uma capela afundada voltou a tocar durante a madrugada. O povo de Rûmora quer respostas antes da próxima lua.",
    region: "Brejo de Gath",
    date: "23 AGO",
    party: "3 / 5",
    tone: "Perigosa",
  },
  {
    urgency: "Recrutando",
    title: "A estrada das efígies",
    summary:
      "Mercadores desapareceram na antiga rota do norte. Restaram apenas estátuas de sal voltadas para o Farol.",
    region: "Estrada Cinzenta",
    date: "27 AGO",
    party: "2 / 5",
    tone: "Moderada",
  },
  {
    urgency: "Rumor",
    title: "O cartógrafo sem rosto",
    summary:
      "Um mapa impossível circula nas tavernas. Suas trilhas mudam toda noite, mas sempre terminam no mesmo nome.",
    region: "Ermos do Poente",
    date: "A definir",
    party: "0 / 5",
    tone: "Desconhecida",
  },
] as const;

export default function Home() {
  return (
    <main className="site-shell">
      <aside className="brand-rail" aria-label="Identidade da campanha">
        <div className="sigil" aria-hidden="true">
          V
        </div>
        <span>WM</span>
        <div className="rail-line" />
        <span>SDL</span>
      </aside>

      <div className="page-frame">
        <header className="topbar">
          <a className="wordmark" href="#inicio" aria-label="Ir para o início">
            <span>Vigília do</span>
            <strong>Último Farol</strong>
          </a>
          <nav aria-label="Navegação principal">
            <a className="nav-link is-active" href="#quadro">
              Missões
            </a>
            <a className="nav-link" href="#campanha">
              Campanha
            </a>
            <a className="nav-link" href="#cronicas">
              Crônicas
            </a>
          </nav>
          <button className="login-button" type="button">
            Entrar com Discord
          </button>
        </header>

        <section className="hero" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow">
              West Marches <span>•</span> Shadow of the Demon Lord
            </p>
            <h1>
              Os ermos não esperam
              <br />
              por <em>heróis.</em>
            </h1>
            <p className="hero-description">
              Escolha um rumor, reúna uma companhia e deixe sua marca em um
              mundo que continua mudando — mesmo quando você não está olhando.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#quadro">
                Explorar missões <span aria-hidden="true">→</span>
              </a>
              <span className="world-status">
                <i aria-hidden="true" /> Mundo ativo
              </span>
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
              <div>
                <p className="section-index">01 / QUADRO</p>
                <h2>Chamados em aberto</h2>
              </div>
              <button className="filter-button" type="button">
                Todos os chamados <span aria-hidden="true">⌄</span>
              </button>
            </div>

            <div className="mission-list">
              {missions.map((mission, index) => (
                <article className="mission-card" key={mission.title}>
                  <div className="mission-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="mission-body">
                    <div className="mission-labels">
                      <span className={`urgency urgency-${index}`}>
                        {mission.urgency}
                      </span>
                      <span>{mission.region}</span>
                    </div>
                    <h3>{mission.title}</h3>
                    <p>{mission.summary}</p>
                  </div>
                  <dl className="mission-meta">
                    <div>
                      <dt>Partida</dt>
                      <dd>{mission.date}</dd>
                    </div>
                    <div>
                      <dt>Companhia</dt>
                      <dd>{mission.party}</dd>
                    </div>
                    <div>
                      <dt>Risco</dt>
                      <dd>{mission.tone}</dd>
                    </div>
                  </dl>
                  <button
                    className="card-action"
                    type="button"
                    aria-label={`Ver missão ${mission.title}`}
                  >
                    ↗
                  </button>
                </article>
              ))}
            </div>
          </div>

          <aside className="campaign-panel" id="campanha">
            <div className="section-heading compact">
              <div>
                <p className="section-index">02 / CAMPANHA</p>
                <h2>O mundo agora</h2>
              </div>
            </div>

            <div className="world-card">
              <p className="world-card-label">Presságio vigente</p>
              <h3>A lua sangra sobre o poente</h3>
              <p>
                Testes de Vontade recebem uma perdição nas terras além do Rio
                Negro.
              </p>
            </div>

            <dl className="campaign-stats">
              <div>
                <dt>Exploradores ativos</dt>
                <dd>28</dd>
              </div>
              <div>
                <dt>Regiões reveladas</dt>
                <dd>07</dd>
              </div>
              <div>
                <dt>Expedições concluídas</dt>
                <dd>13</dd>
              </div>
            </dl>

            <div className="chronicle" id="cronicas">
              <span>Última crônica</span>
              <p>“Cinzas no pomar de Corven”</p>
              <time dateTime="2026-08-18">18 de agosto</time>
            </div>
          </aside>
        </section>

        <footer>
          <span>Uma campanha comunitária, sem fins lucrativos.</span>
          <span>O mundo se lembra.</span>
        </footer>
      </div>
    </main>
  );
}
