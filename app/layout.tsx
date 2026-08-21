import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

const siteTitle = "Ordem da Última Luz";
const siteDescription =
  "Portal da campanha West Marches da Ordem da Última Luz em Shadow of the Demon Lord.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = new URL(`${protocol}://${host}`).origin;
  const socialImage = `${origin}/og.png`;

  return {
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
    <html lang="pt-BR">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
