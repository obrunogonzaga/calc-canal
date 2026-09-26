"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DeletionRequest {
  id: string;
  status: string;
  requestedAt: string;
}

export function AccountDataClient() {
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/conta/exclusao", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível consultar sua solicitação.");
        return response.json();
      })
      .then((data) => { if (active) setRequest(data.request); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function exportData() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/conta/dados", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível exportar seus dados.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dados-liquido.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exportar seus dados.");
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/conta/exclusao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar a solicitação.");
      setRequest(body.request);
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a solicitação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-data-section" aria-labelledby="dados-conta">
      <h2 id="dados-conta">Seus dados</h2>
      <p>Baixe uma cópia em JSON da conta, simulações, produtos e histórico de cobranças. Disponível no Free e no PRO.</p>
      <button className="button secondary" type="button" onClick={() => void exportData()} disabled={busy}>
        Exportar meus dados
      </button>
      <h3>Solicitar exclusão da conta</h3>
      <p>Antes de solicitar, exporte seus dados se quiser guardar uma cópia. A solicitação não apaga a conta imediatamente: a equipe precisa verificar obrigações de retenção ainda em definição. Você receberá um protocolo nesta tela.</p>
      <p>Se houver cartão com renovação ativa, <Link href="/app/plano">cancele a renovação no Plano</Link> e aguarde a confirmação antes de continuar. O período já pago não é reembolsado automaticamente.</p>
      {loading ? <p role="status">Consultando solicitação…</p> : request ? (
        <p role="status">Solicitação recebida. Protocolo: <code>{request.id}</code>. Estado: em análise. Para acompanhar, informe o protocolo ao suporte.</p>
      ) : (
        <div>
          <label htmlFor="confirmar-exclusao">Digite EXCLUIR para confirmar o pedido</label>
          <input id="confirmar-exclusao" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          <button className="button secondary" type="button" onClick={() => void requestDeletion()} disabled={busy || confirmation !== "EXCLUIR"}>
            Solicitar exclusão
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
