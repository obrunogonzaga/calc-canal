"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PRO_MONTHLY_AMOUNT_BRL } from "@/lib/billing-plan";
import { formatBRL } from "@/lib/pricing";

type BillingStatus = {
  plan: "free" | "pro";
  checkoutEnabled: boolean;
  order?: {
    id: string;
    status: string;
    link?: string;
    expiresAt?: string;
  };
  paidUntil?: string;
};

async function readStatus(): Promise<BillingStatus> {
  const response = await fetch("/api/billing/status", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Não foi possível consultar seu plano.");
  return data as BillingStatus;
}
function checkoutLink(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === "https://sandbox.asaas.com" &&
      url.pathname.startsWith("/checkoutSession/show")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
function activeCheckoutLink(order: BillingStatus["order"]): string | null {
  if (
    !order ||
    order.status !== "checkout_created" ||
    (order.expiresAt && new Date(order.expiresAt).getTime() <= Date.now())
  )
    return null;
  return checkoutLink(order.link);
}
function dateLabel(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function dateTimeLabel(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function orderStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    creating: "em preparação",
    checkout_created: "aguardando pagamento",
    pending: "aguardando pagamento",
    paid: "pago",
    canceled: "cancelado",
    expired: "expirado",
    failed: "com falha",
    ambiguous: "em verificação",
  };
  return labels[value.toLowerCase()] || "em andamento";
}

export function BillingClient() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnState, setReturnState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await readStatus());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar seu plano.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setReturnState(new URLSearchParams(window.location.search).get("retorno"));
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!status?.order || status.plan === "pro") return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [status?.order, status?.plan, refresh]);

  async function startCardCheckout() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "card" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Não foi possível preparar o checkout.");
      setStatus(data as BillingStatus);
      const link = activeCheckoutLink((data as BillingStatus).order);
      if (link) window.location.assign(link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout indisponível.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Carregando seu plano…</p>;
  if (!status) return <p role="alert">{error || "Plano indisponível no momento."}</p>;
  const active = status.plan === "pro";
  const link = activeCheckoutLink(status.order);
  const staleOrder = Boolean(
    status.order?.status === "checkout_created" &&
    status.order.expiresAt &&
    new Date(status.order.expiresAt).getTime() <= Date.now(),
  );
  return (
    <div className="billing-app">
      {returnState && !active && (
        <p role="status" className="selection-banner">
          {returnState === "cancelado"
            ? "Checkout cancelado. Nenhum acesso PRO foi liberado."
            : returnState === "expirado"
              ? "Checkout expirado. Nenhum acesso PRO foi liberado."
              : "Retorno do checkout recebido. O PRO só será liberado após a confirmação financeira do Asaas."}
        </p>
      )}
      {error && <p role="alert" className="error-banner">{error}</p>}
      <section className="account-empty">
        <p className="eyebrow">{active ? "PRO ativo" : "Free · nenhuma cobrança"}</p>
        <h2>{active ? "Seu catálogo PRO está disponível." : "Você está na prévia gratuita."}</h2>
        <p>
          {active
            ? "Até 500 produtos, importação CSV e recálculo em lote."
            : `Até cinco produtos no Free. O PRO custa ${formatBRL(PRO_MONTHLY_AMOUNT_BRL)} por mês e inclui até 500 produtos, importação CSV e recálculo em lote.`}
        </p>
        {active && status.paidUntil && (
          <p>Período confirmado até {dateLabel(status.paidUntil)}.</p>
        )}
        {!active && status.order && (
          <p role="status">
            Pedido de teste {orderStatusLabel(status.order.status)}.
            {status.order.expiresAt && ` Checkout válido até ${dateTimeLabel(status.order.expiresAt)}.`}
          </p>
        )}
        {staleOrder && (
          <p className="field-hint">
            Este checkout venceu. Aguardamos a confirmação do Asaas antes de liberar outra tentativa.
          </p>
        )}
        {!active && status.checkoutEnabled && (
          <>
            <p className="field-hint">
              Checkout de teste do Asaas: cartão mensal recorrente. Nenhum cartão é informado ao PreçoPronto.
            </p>
            {link ? (
              <a className="button primary" href={link}>Continuar no Asaas Sandbox</a>
            ) : (
              <button className="button primary" disabled={busy || staleOrder || status.order?.status === "creating"} onClick={startCardCheckout}>
                {busy ? "Preparando…" : staleOrder ? "Pedido em conciliação" : status.order?.status === "creating" ? "Aguardando checkout…" : "Testar checkout no Asaas"}
              </button>
            )}
          </>
        )}
        {!active && !status.checkoutEnabled && (
          <p className="field-hint">
            O checkout ainda está em homologação. Nenhuma assinatura pode ser contratada neste ambiente.
          </p>
        )}
        <p className="field-hint">
          Confira as <Link href="/termos">condições da prévia</Link> antes de continuar.
        </p>
      </section>
    </div>
  );
}
