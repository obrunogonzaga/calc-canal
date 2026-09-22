import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="shell nav-row">
        <Link href="/" className="wordmark" aria-label="PreçoPronto — início">
          <span className="brand-mark" aria-hidden="true">
            p<span>•</span>
          </span>
          Preço<span>Pronto</span>
        </Link>
        <nav aria-label="Principal">
          <Link href="/#calculadora">Calculadora</Link>
          <Link href="/#planos">Planos</Link>
          <Link href="/ajuda">Ajuda</Link>
          {process.env.AUTH_ENABLED === "true" && (
            <Link href="/app">Minha conta</Link>
          )}
        </nav>
        <span className="preview-label">Prévia gratuita</span>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer shell">
      <div>
        <Link className="wordmark small" href="/">
          PreçoPronto<span aria-hidden="true">.</span>
        </Link>
        <p>Mais clareza em cada preço.</p>
      </div>
      <nav aria-label="Rodapé">
        <Link href="/ajuda">Ajuda e contato</Link>
        <Link href="/privacidade">Privacidade</Link>
        <Link href="/termos">Condições desta prévia</Link>
      </nav>
      <p className="footer-note">
        Simulações com os custos informados. Não substituem a conferência das
        tarifas da sua conta ou orientação contábil.
      </p>
    </footer>
  );
}
