import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireVerifiedSession } from "@/lib/server/auth";
import { getEntitlement } from "@/lib/server/products";
import { AccountSessionGuard } from "@/components/account/AccountSessionGuard";
import { SignOut } from "@/components/account/SignOut";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sua conta",
  robots: { index: false, follow: false },
};
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.AUTH_ENABLED !== "true") redirect("/entrar");
  let session;
  let plan: "free" | "pro" = "free";
  try {
    session = await requireVerifiedSession(await headers());
    if (session) plan = (await getEntitlement(session.user.id)).plan;
  } catch {
    return (
      <main id="conteudo" className="shell prose">
        <h1>Não conseguimos abrir sua conta agora.</h1>
        <p>
          O serviço está temporariamente indisponível. Tente novamente em
          instantes.
        </p>
        <Link href="/">Voltar à calculadora</Link>
      </main>
    );
  }
  if (!session) redirect("/entrar");
  return (
    <main id="conteudo" className="shell account-shell">
      <AccountSessionGuard />
      <aside className="account-nav">
        <p className="eyebrow">Seu espaço · {plan === "pro" ? "PRO" : "Free"}</p>
        <nav aria-label="Sua conta">
          <Link href="/app">Simulações</Link>
          <Link href="/app/produtos">Produtos</Link>
          <Link href="/app/calculadora">Calculadora</Link>
          <Link href="/app/plano">Plano</Link>
          <Link href="/app/configuracoes">Configurações</Link>
          <Link href="/app/ajuda">Ajuda</Link>
        </nav>
        <SignOut />
      </aside>
      <div className="account-body">{children}</div>
    </main>
  );
}
