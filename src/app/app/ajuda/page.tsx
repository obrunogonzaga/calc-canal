import Link from "next/link";
export default function AccountHelp() {
  return (
    <>
      <h1>Ajuda</h1>
      <div className="account-empty">
        <h2>Uma prévia para conferir suas contas.</h2>
        <p>
          A calculadora e suas simulações salvas já podem ser testadas.
          Produtos, CSV, assinatura e cobrança ainda estão em preparação.
        </p>
        <p>
          Se a sessão expirar, entre novamente. Para confirmar o e-mail ou
          recuperar senha, use os links na tela de acesso.
        </p>
        <Link className="button secondary" href="/ajuda">
          Abrir guia da calculadora
        </Link>
        <p>
          <Link href="/privacidade">Como os dados da prévia são tratados</Link>
        </p>
      </div>
    </>
  );
}
