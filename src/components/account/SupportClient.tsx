"use client";

import { useState } from "react";

export function SupportClient() {
  const [category, setCategory] = useState("acesso");
  const [message, setMessage] = useState("");
  const [protocol, setProtocol] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/conta/suporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não conseguimos enviar a mensagem.");
      setProtocol(body.protocol);
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não conseguimos enviar a mensagem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-support-form" onSubmit={(event) => void submit(event)}>
      <h2>Enviar mensagem ao suporte</h2>
      <p>Usaremos o e-mail confirmado da sua conta para identificar o pedido. Não envie senhas, tokens ou dados de cartão.</p>
      <label htmlFor="support-category">Assunto</label>
      <select id="support-category" value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="acesso">Acesso</option>
        <option value="calculo">Cálculo</option>
        <option value="csv">CSV</option>
        <option value="cobranca">Cobrança e cancelamento</option>
        <option value="dados">Meus dados</option>
        <option value="outro">Outro</option>
      </select>
      <label htmlFor="support-message">Mensagem</label>
      <textarea id="support-message" required minLength={10} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} />
      <button className="button secondary" type="submit" disabled={busy || message.trim().length < 10}>Enviar ao suporte</button>
      {protocol && <p role="status">Mensagem enviada. Protocolo: <code>{protocol}</code>.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
