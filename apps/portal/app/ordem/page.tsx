import type { Metadata } from "next";
import { PageContainer, Section } from "@/components/layout/page-container";
import { Card, Eyebrow, PageHeader } from "@/components/ui/surface";
import {
  fiveTruths,
  levelProgression,
  missionProtocol,
  orderCode,
  orderMotto,
} from "@/content/ordem-da-ultima-luz";

const description =
  "Código da Ordem da Última Luz: conduta à mesa, progressão de personagens, protocolo de missões e divisão de tesouros.";

export const metadata: Metadata = {
  title: "Código da Ordem",
  description,
  openGraph: { title: "Código da Ordem — Ordem da Última Luz", description },
};

const documentSections = [
  { href: "#codigo", label: "Código" },
  { href: "#progresso", label: "Progressão" },
  { href: "#missoes", label: "Missões" },
  { href: "#tesouros", label: "Tesouros" },
  { href: "#verdades", label: "Rûl" },
];

export default function OrderPage() {
  return (
    <>
      <nav
        aria-label="Seções do Código"
        className="sticky top-18 z-30 border-b border-line-soft bg-canvas/85 backdrop-blur-md"
      >
        <ul className="mx-auto flex max-w-7xl list-none gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {documentSections.map((section) => (
            <li key={section.href}>
              <a
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                href={section.href}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <PageContainer>
        <PageHeader
          eyebrow="Documento oficial"
          title={
            <>
              O Código
              <br />
              da Ordem
            </>
          }
          description="Estas regras organizam a convivência, a participação nas missões e a progressão dos personagens. Situações excepcionais podem exigir ajustes, sempre comunicados pela Ordem."
        />
        <p className="max-w-[60ch] border-l-2 border-accent-line pl-4 font-display text-lg text-fg-muted italic">
          {orderMotto}
        </p>

        <Section id="codigo" eyebrow="I / Código" title="Sete compromissos">
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
            {orderCode.map((rule) => (
              <li key={rule.numeral}>
                <Card className="flex h-full gap-4">
                  <span
                    aria-hidden="true"
                    className="font-display text-2xl text-accent tabular-nums"
                  >
                    {rule.numeral}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-display text-lg leading-tight">{rule.title}</h3>
                    <p className="text-sm text-fg-muted text-pretty">{rule.body}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="progresso" eyebrow="II / Progressão" title="Experiência demonstrada">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Card padding="lg" className="space-y-3">
              <Eyebrow>Novato → Especialista</Eyebrow>
              <h3 className="font-display text-2xl leading-tight">
                XP necessário + 4 missões realizadas + 2 concluídas
              </h3>
              <p className="text-fg-muted text-pretty">
                O novo grau representa poder adquirido e a confiança depositada pela Ordem. A
                progressão para Mestre ainda está em criação.
              </p>
            </Card>

            <Card padding="lg" className="space-y-4">
              <h3 className="text-sm font-semibold text-fg-muted">
                Sessões necessárias por nível
              </h3>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line-soft bg-line-soft sm:grid-cols-4">
                {levelProgression.map((step) => (
                  <div className="bg-surface p-3 text-center" key={step.from}>
                    <dt className="text-xs text-fg-subtle">
                      Nível {step.from} → {step.to}
                    </dt>
                    <dd className="mt-1 font-display text-2xl font-bold">
                      {step.sessions}
                      <span className="block text-xs font-normal text-fg-subtle">
                        {step.sessions === 1 ? "sessão" : "sessões"}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-fg-subtle">
                A regra continua: nível atual + 1 sessões. O formato está em avaliação.
              </p>
            </Card>
          </div>

          <Card padding="lg" className="space-y-2 bg-surface-2">
            <Eyebrow>Nova trilha</Eyebrow>
            <h3 className="font-display text-xl">O aprendizado também pertence à história</h3>
            <p className="max-w-[70ch] text-fg-muted text-pretty">
              Ao avançar de grau, explique brevemente como seu personagem adquiriu a nova Trilha:
              treinamento, estudo, um mestre, um manual, uma missão ou um acordo. A origem precisa
              fazer sentido em Urth, sem exigir uma aventura inteira.
            </p>
          </Card>
        </Section>

        <Section id="missoes" eyebrow="III / Missões" title="Do chamado à partida">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {missionProtocol.map((item) => (
              <div key={item.label}>
                <Card className="h-full space-y-2">
                  <dt className="text-xs font-bold tracking-wider text-fg-subtle uppercase">
                    {item.label}
                  </dt>
                  <dd className="space-y-2">
                    <strong className="block font-display text-2xl">{item.value}</strong>
                    <span className="block text-sm text-fg-muted text-pretty">{item.body}</span>
                  </dd>
                </Card>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "Mínimo de três integrantes",
                body: "Se a segunda chamada não completar o grupo, os presentes escolhem entre contratar um mercenário, quando possível, ou abandonar a missão.",
              },
              {
                title: "Missões abandonadas",
                body: "Jogadores selecionados e presentes terão prioridade caso a missão seja reagendada.",
              },
              {
                title: "Agenda atual",
                body: "O plano é uma sessão semanal, às segundas-feiras, das 20h às 23h, com duração mínima de três horas. Alterações serão comunicadas pela Ordem.",
              },
            ].map((note) => (
              <Card className="h-full space-y-2" key={note.title}>
                <h3 className="font-display text-lg leading-tight">{note.title}</h3>
                <p className="text-sm text-fg-muted text-pretty">{note.body}</p>
              </Card>
            ))}
          </div>
        </Section>

        <Section id="tesouros" eyebrow="IV / Tesouros" title="Registrar, declarar, dividir">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card padding="lg" className="space-y-4">
              <p className="text-fg-muted text-pretty">
                Moedas são divididas igualmente entre todos os participantes. Para joias, pedras
                preciosas e outros itens com valor de venda, cada jogador registra sua intenção no
                relato da missão.
              </p>
              <ul className="space-y-2 pl-5 text-fg-muted">
                <li>
                  <strong className="text-fg">Quero o item:</strong> o jogador deseja adquiri-lo
                  pelo valor de venda.
                </li>
                <li>
                  <strong className="text-fg">Quero vender:</strong> o jogador prefere receber sua
                  parte em moedas.
                </li>
              </ul>
            </Card>
            <Card padding="lg" className="space-y-2 bg-surface-2">
              <Eyebrow>Exemplo oficial</Eyebrow>
              <h3 className="font-display text-xl">Safira de 100 moedas</h3>
              <p className="text-sm text-fg-muted text-pretty">
                Em um grupo de quatro, quem ficar com a safira paga 75 moedas na prática; os demais
                recebem 25 cada. Havendo mais de um interessado, uma moeda decide.
              </p>
            </Card>
          </div>
          <p className="border-l-2 border-accent bg-accent-soft px-4 py-3 text-fg-muted">
            Toda intenção deve ser registrada. O silêncio será entendido como preferência pela
            venda.
          </p>
        </Section>

        <Section id="verdades" eyebrow="V / Rûl" title="Cinco verdades do mundo">
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {fiveTruths.map((truth) => (
              <li key={truth.numeral}>
                <Card className="h-full space-y-2">
                  <span aria-hidden="true" className="font-display text-xl text-accent">
                    {truth.numeral}
                  </span>
                  <h3 className="font-display text-lg leading-tight">{truth.title}</h3>
                  <p className="text-sm text-fg-muted text-pretty">{truth.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>

        <p className="border-t border-line-soft pt-6 text-sm text-fg-subtle">
          Documento oficial da campanha — enquanto houver luz, haverá esperança.
        </p>
      </PageContainer>
    </>
  );
}
