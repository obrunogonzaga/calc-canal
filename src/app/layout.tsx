import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Calculadora de preço marketplace | CalcCanal",
  description:
    "Calcule preço de venda e lucro líquido no Mercado Livre, Shopee, Amazon Brasil e Magalu. Precificação para sellers BR.",
  openGraph: {
    title: "Calculadora de preço marketplace | CalcCanal",
    description:
      "Precificação marketplace BR: ML, Shopee, Amazon e Magalu em um clique.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
