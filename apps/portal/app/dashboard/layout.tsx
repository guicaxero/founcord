import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardRoute } from "@/components/admin/dashboard-route";

export const metadata: Metadata = {
  title: { default: "Painel da campanha", template: "%s · Painel — Ordem da Última Luz" },
  description: "Gestão da campanha Ordem da Última Luz.",
  robots: { index: false, follow: false },
};

/**
 * O painel vive no layout para que a campanha escolhida sobreviva à troca de
 * área; as páginas só validam o endereço e definem o título.
 */
export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <DashboardRoute />
      {children}
    </>
  );
}
