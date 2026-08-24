import type { Metadata } from "next";
import { FoundryPairingClient } from "@/components/foundry-pairing-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Autorizar mundo do Foundry",
  description: "Autorize com segurança a conexão de um mundo do Foundry à campanha.",
  robots: { index: false, follow: false },
};

export default async function FoundryConnectPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ code?: string }> }>) {
  const { code = "" } = await searchParams;
  return <FoundryPairingClient initialCode={code} />;
}
