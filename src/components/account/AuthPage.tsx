import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "./AuthForm";

export function AuthPage({
  mode,
  title,
  description,
}: {
  mode: "signup" | "signin" | "forgot" | "reset";
  title: string;
  description: string;
}) {
  const available = process.env.AUTH_ENABLED === "true";
  return (
    <main id="conteudo" className="shell auth-page">
      <div className="auth-intro">
        <Link className="text-link" href="/">
          ← Voltar à calculadora
        </Link>
        <h1>{title}</h1>
        <p>{description}</p>
        <p className="auth-caption">
          Mais clareza em cada preço. Uma conta por vez.
        </p>
      </div>
      <section className="auth-panel" aria-label={title}>
        {available ? (
          <>
            <p className="account-preview-notice">
              {process.env.APP_ENV === "local"
                ? "Ambiente local de testes. Use apenas dados fictícios e e-mails @precopronto.test."
                : "Conta da prévia gratuita. Nenhuma assinatura ou cobrança é criada."}
            </p>
            <Suspense fallback={<p role="status">Preparando o formulário…</p>}>
              <AuthForm mode={mode} />
            </Suspense>
          </>
        ) : (
          <div className="account-message">
            <h2>Cadastro em preparação</h2>
            <p>
              O serviço de contas não está configurado neste ambiente. Você pode
              continuar calculando sem cadastro.
            </p>
            <Link href="/#calculadora" className="button primary">
              Voltar à calculadora
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
