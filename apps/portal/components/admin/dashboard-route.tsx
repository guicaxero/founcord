"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { DashboardClient } from "./dashboard-client";

/** Lê a área do endereço (`/dashboard/[area]`) e entrega ao painel. */
export function DashboardRoute() {
  const segment = useSelectedLayoutSegment();
  // Em `/dashboard` o segmento pode vir vazio ou como marcador interno da página.
  return <DashboardClient area={segment && !segment.startsWith("__") ? segment : null} />;
}
