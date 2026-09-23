import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { getSiteOrigin } from "@/lib/site";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const origin = getSiteOrigin();
export const metadata: Metadata = {
  metadataBase: origin ? new URL(origin) : undefined,
  title: {
    default: "Líquido — calcule preços para marketplaces",
    template: "%s | Líquido",
  },
  description:
    "Calcule seu preço de venda, entenda quanto sobra e confira cada custo. Simulação gratuita para vendedores de marketplaces, sem cadastro.",
  robots: origin
    ? { index: true, follow: true }
    : { index: false, follow: false },
  openGraph: {
    title: "Líquido — saiba o que sobra de cada venda",
    description:
      "Seu custo, suas taxas e sua margem. Faça uma simulação gratuita, sem cadastro.",
    locale: "pt_BR",
    type: "website",
    siteName: "Líquido",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body className={geist.variable}>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
