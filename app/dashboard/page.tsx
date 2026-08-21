import type { Metadata } from "next";
import { DashboardClient } from "@/components/admin/dashboard-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Painel da campanha",
  description: "Administração da campanha Vigília do Último Farol.",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <DashboardClient />;
}
