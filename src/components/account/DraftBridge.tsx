"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DRAFT_KEY,
  validateDraft,
  type SimulationDraft,
} from "@/lib/simulation-draft";
import { calculatePricing, formatBRL } from "@/lib/pricing";
export function DraftBridge() {
  const router = useRouter();
  const [draft, setDraft] = useState<SimulationDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) setDraft(validateDraft(JSON.parse(raw)));
    } catch {
      setError(
        "O rascunho desta aba precisa ser revisado. Faça uma nova simulação; seus dados salvos não foram alterados.",
      );
    }
  }, []);
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/simulacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Não foi possível salvar.");
      sessionStorage.removeItem(DRAFT_KEY);
      setDraft(null);
      setNotice("Simulação salva na sua conta.");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Falha de conexão. Sua simulação continua nesta aba.",
      );
    } finally {
      setBusy(false);
    }
  }
  function discard() {
    sessionStorage.removeItem(DRAFT_KEY);
    setDraft(null);
    setError(null);
  }
  if (!draft && !error && !notice) return null;
  return (
    <section className="draft-banner" aria-label="Continuar simulação">
      <h2>
        {draft ? "Sua simulação veio com você" : "Continuidade da simulação"}
      </h2>
      {draft && (
        <>
          <p>
            Preço calculado:{" "}
            <strong>
              {formatBRL(calculatePricing(draft.input).suggestedPrice)}
            </strong>
            . Confira as premissas antes de guardar este resultado na sua conta.
          </p>
          <p className="field-hint">
            Comissão: {draft.input.commissionPercent}%. Imposto:{" "}
            {draft.excludeTax ? "não incluído" : `${draft.input.taxPercent}%`}.
            Regra:{" "}
            {draft.tariffMode === "manual" ? "taxas manuais" : "ME2 Drop Off"}.
          </p>
          <div className="account-actions">
            <button className="button primary" onClick={save} disabled={busy}>
              {busy ? "Salvando…" : "Salvar na minha conta"}
            </button>
            <button className="text-button" onClick={discard} disabled={busy}>
              Descartar rascunho desta aba
            </button>
          </div>
        </>
      )}
      {notice && (
        <p role="status" className="success-banner">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error} <Link href="/app/calculadora">Calcular novamente</Link>
        </p>
      )}
    </section>
  );
}
