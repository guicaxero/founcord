import { PageContainer, Section } from "@/components/layout/page-container";
import { Chronicles } from "@/components/editorial/chronicles";
import { HomeDiarySection, PortalDestinations } from "@/components/home/home-sections";
import { MissionBoard } from "@/components/missions/mission-board";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/surface";
import { fiveTruths, orderMotto } from "@/content/ordem-da-ultima-luz";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

export const dynamic = "force-dynamic";

export default function Home() {
  // A crise imperial é o gancho principal da campanha nesta fase.
  const truth = fiveTruths.find((entry) => entry.title.includes("Império")) ?? fiveTruths[0];

  return (
    <PageContainer>
      <section className="relative isolate overflow-hidden rounded-xl border border-line-soft bg-surface px-6 py-16 sm:px-12 sm:py-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-24 size-96 rounded-full bg-accent/12 blur-3xl"
        />
        <div className="relative max-w-3xl space-y-6">
          <Eyebrow>Shadow of the Demon Lord</Eyebrow>
          <h1 className="font-display text-5xl leading-[1.05] text-balance sm:text-7xl">
            Enquanto houver luz,{" "}
            <br className="hidden lg:block" />
            haverá <em className="text-accent not-italic">esperança.</em>
          </h1>
          <p className="max-w-[60ch] text-lg text-fg-muted text-pretty">
            Uma Ordem para aqueles dispostos a enfrentar a escuridão — qualquer que
            seja sua origem — e proteger o que ainda merece permanecer de pé.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/missoes" variant="accent" size="lg">
              Ver chamados abertos
            </ButtonLink>
            <ButtonLink href="/ordem" variant="secondary" size="lg">
              Conhecer a Ordem
            </ButtonLink>
          </div>
          <p className="border-l-2 border-accent-line pl-4 font-display text-fg-muted italic">
            {orderMotto}
          </p>
        </div>
      </section>

      <PortalDestinations />

      <Section
        id="chamados"
        eyebrow="Quadro"
        title="Chamados da Ordem"
        description="Missões publicadas para a campanha. Entre com o Discord para se inscrever."
        action={
          <ButtonLink href="/missoes" variant="ghost">
            Ver todas
          </ButtonLink>
        }
      >
        <MissionBoard campaignId={DEFAULT_CAMPAIGN_ID} limit={3} />
      </Section>

      <Section
        eyebrow="Arquivo"
        title="Últimas crônicas"
        description="Os textos que a Ordem revisou e publicou."
        action={
          <ButtonLink href="/cronicas" variant="ghost">
            Ver todas
          </ButtonLink>
        }
      >
        <Chronicles campaignId={DEFAULT_CAMPAIGN_ID} limit={2} />
      </Section>

      <HomeDiarySection campaignId={DEFAULT_CAMPAIGN_ID} />

      {truth ? (
        <Card padding="lg" className="bg-surface-2">
          <Eyebrow>Uma das cinco verdades de Rûl</Eyebrow>
          <h2 className="mt-2 mb-3 font-display text-3xl leading-tight">{truth.title}</h2>
          <p className="max-w-[70ch] text-fg-muted text-pretty">{truth.body}</p>
        </Card>
      ) : null}
    </PageContainer>
  );
}
