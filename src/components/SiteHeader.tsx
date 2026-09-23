import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="shell nav-row">
        <Link href="/" className="wordmark" aria-label="Líquido — início">
          <span className="brand-mark" aria-hidden="true">
            L<span>•</span>
          </span>
          Líquido
        </Link>
        <nav aria-label="Principal">
          <Link href="/#calculadora">Calculadora</Link>
          <Link href="/#planos">Planos</Link>
          <Link href="/ajuda">Ajuda</Link>
          {process.env.AUTH_ENABLED === "true" && (
            <Link href="/app">Minha conta</Link>
          )}
        </nav>
        <span className="preview-label">Calculadora grátis</span>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer shell">
      <div>
        <Link className="wordmark small" href="/">
          Líquido<span aria-hidden="true">.</span>
        </Link>
        <p>O que sobra de cada venda, com as premissas à vista.</p>
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
