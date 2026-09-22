"use client";

import { useState } from "react";
import { saveWaitlistEmail } from "@/lib/freemium";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
}

export function PaywallModal({ open, onClose }: PaywallModalProps) {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    saveWaitlistEmail(email);
    setSaved(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="paywall-title" className="text-xl font-semibold text-slate-900">
          PRO em breve — R$ 19,90/mês
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Você usou os 5 cálculos gratuitos de hoje. Entre na lista de espera
          para cálculos ilimitados, PDF sem marca d&apos;água e histórico.
        </p>
        {saved ? (
          <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
            Obrigado! Te avisamos quando o PRO abrir.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              Entrar na waitlist
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-700"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
