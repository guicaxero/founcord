import type { Metadata } from "next";
import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { MerchantCatalog } from "@/components/merchant-catalog";
import { ResponsiveNavigation } from "@/components/responsive-navigation";
import { DEFAULT_CAMPAIGN_ID } from "@/server/constants";

export const metadata: Metadata = {
  title: "Mercador",
  description:
    "Consulte os itens, preços e quantidades disponíveis no Mercador da Ordem da Última Luz.",
  openGraph: {
    title: "Mercador — Ordem da Última Luz",
    description:
      "Consulte os itens, preços e quantidades disponíveis no Mercador da Ordem da Última Luz.",
  },
};

export const dynamic = "force-dynamic";

export default function MerchantPage() {
  return (
    <main className="site-shell" id="main-content">
      <aside className="brand-rail" aria-label="Identidade da campanha">
        <div className="sigil" aria-hidden="true">O</div>
        <span>WM</span>
        <div className="rail-line" />
        <span>SDL</span>
      </aside>

      <div className="page-frame merchant-page">
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
              { href: "/#diario", label: "Diário de Sessões" },
              { href: "/mercador", label: "Mercador", current: true },
            ]}
          />
          <AccountMenu />
        </header>

        <MerchantCatalog campaignId={DEFAULT_CAMPAIGN_ID} />

        <footer>
          <span>Uma campanha comunitária, sem fins lucrativos.</span>
          <span>Enquanto houver luz, haverá esperança.</span>
        </footer>
      </div>
    </main>
  );
}
