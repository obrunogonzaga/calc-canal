import Link from "next/link";
export default function Products() {
  return (
    <>
      <h1>Seus produtos</h1>
      <div className="account-empty">
        <h2>O catálogo está em preparação.</h2>
        <p>
          A conta Free terá até 5 produtos e o PRO até 500. Por enquanto, você
          já pode salvar os resultados das suas simulações.
        </p>
        <Link className="button primary" href="/app/calculadora">
          Fazer uma simulação
        </Link>
      </div>
    </>
  );
}
