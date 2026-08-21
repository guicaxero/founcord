import type { Metadata } from "next";
import Link from "next/link";
import {
  fiveTruths,
  levelProgression,
  missionProtocol,
  orderCode,
  orderMotto,
} from "@/content/ordem-da-ultima-luz";

export const metadata: Metadata = {
  title: "Código da Ordem",
  description:
    "Código, progressão e protocolos oficiais da Ordem da Última Luz.",
  openGraph: {
    title: "Código da Ordem — Ordem da Última Luz",
    description:
      "Código, progressão e protocolos oficiais da Ordem da Última Luz.",
  },
  twitter: {
    title: "Código da Ordem — Ordem da Última Luz",
    description:
      "Código, progressão e protocolos oficiais da Ordem da Última Luz.",
  },
};

export default function OrderPage() {
  return (
    <main className="order-page">
      <header className="order-topbar">
        <Link className="wordmark" href="/">
          <span>Ordem da</span><strong>Última Luz</strong>
        </Link>
        <nav aria-label="Navegação do Código">
          <a href="#codigo">Código</a>
          <a href="#progresso">Progressão</a>
          <a href="#missoes">Missões</a>
          <a href="#tesouros">Tesouros</a>
        </nav>
        <Link className="text-action" href="/">Voltar ao portal</Link>
      </header>

      <section className="order-hero">
        <p className="eyebrow">Documento oficial <span>•</span> Ordem da Última Luz</p>
        <h1>O Código<br />da Ordem</h1>
        <blockquote>“{orderMotto}”</blockquote>
        <p>
          Estas regras organizam a convivência, a participação nas missões e a
          progressão dos personagens. Situações excepcionais podem exigir ajustes,
          sempre comunicados pela Ordem.
        </p>
      </section>

      <section className="order-document" id="codigo">
        <header className="document-heading">
          <p className="section-index">I / CÓDIGO</p>
          <h2>Sete compromissos</h2>
        </header>
        <div className="code-grid">
          {orderCode.map((rule) => (
            <article key={rule.numeral}>
              <span>{rule.numeral}</span>
              <div><h3>{rule.title}</h3><p>{rule.body}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="order-document order-document-dark" id="progresso">
        <header className="document-heading">
          <p className="section-index">II / PROGRESSÃO</p>
          <h2>Experiência demonstrada</h2>
        </header>
        <div className="degree-layout">
          <article className="degree-card">
            <span>Novato → Especialista</span>
            <h3>XP necessário + 4 missões realizadas + 2 concluídas</h3>
            <p>
              O novo grau representa poder adquirido e a confiança depositada pela
              Ordem. A progressão para Mestre ainda está em criação.
            </p>
          </article>
          <div className="level-track" aria-label="Sessões necessárias por nível">
            {levelProgression.map((step) => (
              <div key={step.from}>
                <span>Nível {step.from} → {step.to}</span>
                <strong>{step.sessions}</strong>
                <small>{step.sessions === 1 ? "sessão" : "sessões"}</small>
              </div>
            ))}
            <p>A regra continua: nível atual + 1 sessões. O formato está em avaliação.</p>
          </div>
        </div>
        <article className="trail-note">
          <span>Nova Trilha</span>
          <h3>O aprendizado também pertence à história</h3>
          <p>
            Ao avançar de grau, explique brevemente como seu personagem adquiriu a
            nova Trilha: treinamento, estudo, um mestre, um manual, uma missão ou um
            acordo. A origem precisa fazer sentido em Urth, sem exigir uma aventura inteira.
          </p>
        </article>
      </section>

      <section className="order-document" id="missoes">
        <header className="document-heading">
          <p className="section-index">III / MISSÕES</p>
          <h2>Do chamado à partida</h2>
        </header>
        <div className="protocol-grid">
          {missionProtocol.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span><strong>{item.value}</strong><p>{item.body}</p>
            </article>
          ))}
        </div>
        <div className="mission-notes">
          <article>
            <h3>Mínimo de três integrantes</h3>
            <p>
              Se a segunda chamada não completar o grupo, os presentes escolhem entre
              contratar um mercenário, quando possível, ou abandonar a missão.
            </p>
          </article>
          <article>
            <h3>Missões abandonadas</h3>
            <p>
              Jogadores selecionados e presentes terão prioridade caso a missão seja
              reagendada.
            </p>
          </article>
          <article>
            <h3>Agenda atual</h3>
            <p>
              O plano é uma sessão semanal, às segundas-feiras, das 20h às 23h,
              com duração mínima de três horas. Alterações serão comunicadas pela Ordem.
            </p>
          </article>
        </div>
      </section>

      <section className="order-document treasure-section" id="tesouros">
        <header className="document-heading">
          <p className="section-index">IV / TESOUROS</p>
          <h2>Registrar, declarar, dividir</h2>
        </header>
        <div className="treasure-layout">
          <div>
            <p>
              Moedas são divididas igualmente entre todos os participantes. Para joias,
              pedras preciosas e outros itens com valor de venda, cada jogador registra
              sua intenção no relato da missão.
            </p>
            <ul>
              <li><strong>Quero o item:</strong> o jogador deseja adquiri-lo pelo valor de venda.</li>
              <li><strong>Quero vender:</strong> o jogador prefere receber sua parte em moedas.</li>
            </ul>
          </div>
          <aside>
            <span>Exemplo oficial</span>
            <h3>Safira de 100 moedas</h3>
            <p>
              Em um grupo de quatro, quem ficar com a safira paga 75 moedas na prática;
              os demais recebem 25 cada. Havendo mais de um interessado, uma moeda decide.
            </p>
          </aside>
        </div>
        <p className="document-callout">
          Toda intenção deve ser registrada. O silêncio será entendido como preferência pela venda.
        </p>
      </section>

      <section className="order-document truths-section">
        <header className="document-heading">
          <p className="section-index">V / RÛL</p>
          <h2>Cinco verdades do mundo</h2>
        </header>
        <div className="truth-grid">
          {fiveTruths.map((truth) => (
            <article key={truth.numeral}>
              <span>{truth.numeral}</span><h3>{truth.title}</h3><p>{truth.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="order-footer">
        <span>Documento oficial da campanha</span>
        <strong>Enquanto houver luz, haverá esperança.</strong>
      </footer>
    </main>
  );
}
