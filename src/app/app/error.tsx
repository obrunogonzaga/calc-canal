"use client";
export default function AccountError({ reset }: { reset: () => void }) {
  return (
    <div className="account-message" role="alert">
      <h1>Não conseguimos carregar seus dados.</h1>
      <p>O serviço pode estar indisponível. Seus dados não foram alterados.</p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
