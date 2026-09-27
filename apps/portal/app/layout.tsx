import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { MotionProvider } from "@/components/ui/motion";
import { Providers } from "./providers";

const siteTitle = "Ordem da Última Luz";
const siteDescription =
  "Portal da campanha da Ordem da Última Luz em Shadow of the Demon Lord: missões, crônicas, diário de sessões e Lojista.";
const siteOrigin = process.env.SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  await headers();
  const socialImage = `${siteOrigin}/og.png`;

  return {
    metadataBase: new URL(siteOrigin),
    title: {
      default: siteTitle,
      template: `%s — ${siteTitle}`,
    },
    description: siteDescription,
    openGraph: {
      type: "website",
      locale: "pt_BR",
      title: siteTitle,
      description: siteDescription,
      images: [{ url: socialImage, width: 1731, height: 908 }],
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description: siteDescription,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>
        <Providers>
          <MotionProvider>
            <AppShell>{children}</AppShell>
          </MotionProvider>
        </Providers>
      </body>
    </html>
  );
}
