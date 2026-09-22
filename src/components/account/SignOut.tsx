"use client";
import { useState } from "react";
import { DRAFT_KEY } from "@/lib/simulation-draft";
export function SignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("signout");
      sessionStorage.removeItem(DRAFT_KEY);
      window.location.replace("/entrar");
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={signOut}
      >
        {busy ? "Saindo…" : "Sair da conta"}
      </button>
      {error && (
        <p role="alert" className="field-error">
          Não foi possível sair. Tente novamente.
        </p>
      )}
    </div>
  );
}
