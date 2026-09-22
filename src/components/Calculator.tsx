"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import channelsData from "@/data/channels.json";
import type { ChannelId } from "@/types/channels";
import {
  canCalculate,
  FREE_DAILY_LIMIT,
  getDailyCalculationCount,
  incrementCalculationCount,
} from "@/lib/freemium";
import { downloadBreakdownPdf } from "@/lib/pdf";
import {
  calculatePricing,
  formatBRL,
  type CalcMode,
  type PricingBreakdown,
} from "@/lib/pricing";
import { PaywallModal } from "./PaywallModal";

const channelEntries = Object.entries(channelsData).filter(
  ([key]) => key !== "_comment"
) as [ChannelId, (typeof channelsData)["mercado_livre"]][];

function parseNum(value: string): number {
  const n = parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function Calculator() {
  const [channelId, setChannelId] = useState<ChannelId>("mercado_livre");
  const channel = channelsData[channelId];

  const [mode, setMode] = useState<CalcMode>("margin_to_price");
  const [productCost, setProductCost] = useState("50");
  const [packaging, setPackaging] = useState("3");
  const [sellerShipping, setSellerShipping] = useState("0");
  const [desiredMargin, setDesiredMargin] = useState("20");
  const [taxPercent, setTaxPercent] = useState("6");
  const [commissionPercent, setCommissionPercent] = useState(
    String(channel.commissionPercent)
  );
  const [fixedFee, setFixedFee] = useState(String(channel.fixedFee));
  const [salePrice, setSalePrice] = useState("100");
  const [breakdown, setBreakdown] = useState<PricingBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [usageCount, setUsageCount] = useState(0);

  const syncChannelDefaults = useCallback((id: ChannelId) => {
    const c = channelsData[id];
    setCommissionPercent(String(c.commissionPercent));
    setFixedFee(String(c.fixedFee));
  }, []);

  const remaining = useMemo(
    () => Math.max(0, FREE_DAILY_LIMIT - usageCount),
    [usageCount]
  );

  useEffect(() => {
    setUsageCount(getDailyCalculationCount());
  }, []);

  function refreshUsage() {
    setUsageCount(getDailyCalculationCount());
  }

  function handleChannelChange(id: ChannelId) {
    setChannelId(id);
    syncChannelDefaults(id);
    setBreakdown(null);
  }

  function runCalculate() {
    setError(null);
    if (!canCalculate()) {
      setPaywallOpen(true);
      return;
    }

    try {
      const result = calculatePricing({
        productCost: parseNum(productCost),
        packaging: parseNum(packaging),
        sellerShipping: parseNum(sellerShipping),
        desiredMarginPercent: parseNum(desiredMargin),
        taxPercent: parseNum(taxPercent),
        commissionPercent: parseNum(commissionPercent),
        fixedFee: parseNum(fixedFee),
        salePrice: parseNum(salePrice),
        mode,
      });
      incrementCalculationCount();
      refreshUsage();
      setBreakdown(result);
    } catch (e) {
      setBreakdown(null);
      setError(e instanceof Error ? e.message : "Erro ao calcular.");
    }
  }

  function handlePdf() {
    if (!breakdown) return;
    downloadBreakdownPdf(channel.label, breakdown);
  }

  return (
    <>
      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Calculadora</h2>
            <p className="text-xs text-slate-500">
              {remaining} de {FREE_DAILY_LIMIT} cálculos grátis hoje
            </p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("margin_to_price")}
              className={`flex-1 rounded-md px-3 py-2 font-medium transition ${
                mode === "margin_to_price"
                  ? "bg-white text-teal-700 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              Custo + margem → preço
            </button>
            <button
              type="button"
              onClick={() => setMode("price_to_profit")}
              className={`flex-1 rounded-md px-3 py-2 font-medium transition ${
                mode === "price_to_profit"
                  ? "bg-white text-teal-700 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              Preço → lucro
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {channelEntries.map(([id, c]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleChannelChange(id)}
              className={`rounded-xl border px-3 py-3 text-left text-sm font-medium transition ${
                channelId === id
                  ? "border-teal-500 bg-teal-50 text-teal-900"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Custo do produto (R$)" value={productCost} onChange={setProductCost} />
          <Field label="Embalagem (R$)" value={packaging} onChange={setPackaging} />
          <Field
            label="Frete pago pelo seller (R$)"
            value={sellerShipping}
            onChange={setSellerShipping}
          />
          {mode === "margin_to_price" ? (
            <Field
              label="Margem desejada (%)"
              value={desiredMargin}
              onChange={setDesiredMargin}
            />
          ) : (
            <Field
              label="Preço de venda (R$)"
              value={salePrice}
              onChange={setSalePrice}
            />
          )}
          <Field
            label="Imposto aproximado (%)"
            value={taxPercent}
            onChange={setTaxPercent}
          />
          <Field
            label="Comissão do canal (%)"
            value={commissionPercent}
            onChange={setCommissionPercent}
          />
          <Field
            label="Taxa fixa do canal (R$)"
            value={fixedFee}
            onChange={setFixedFee}
          />
        </div>

        <p className="mt-3 text-xs text-slate-500">{channel.sourceNote}</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={runCalculate}
            className="flex-1 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Calcular
          </button>
          <button
            type="button"
            onClick={handlePdf}
            disabled={!breakdown}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Baixar PDF (marca d&apos;água)
          </button>
        </div>

        {breakdown && (
          <div className="mt-6 rounded-xl border border-teal-100 bg-teal-50/50 p-4">
            <p className="text-sm text-slate-600">Resultado</p>
            <p className="mt-1 text-2xl font-bold text-teal-800">
              {mode === "margin_to_price"
                ? formatBRL(breakdown.suggestedPrice)
                : formatBRL(breakdown.netProfit)}
            </p>
            <p className="text-xs text-slate-500">
              {mode === "margin_to_price"
                ? "Preço sugerido de venda"
                : "Lucro líquido estimado"}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <Row label="Custo produto" value={formatBRL(breakdown.productCost)} />
              <Row label="Embalagem" value={formatBRL(breakdown.packaging)} />
              <Row label="Frete seller" value={formatBRL(breakdown.sellerShipping)} />
              <Row label="Comissão" value={formatBRL(breakdown.commission)} />
              <Row label="Taxa fixa" value={formatBRL(breakdown.fixedFee)} />
              <Row label="Imposto" value={formatBRL(breakdown.tax)} />
              <Row
                label="Lucro líquido"
                value={formatBRL(breakdown.netProfit)}
                highlight
              />
              <Row label="% lucro sobre venda" value={`${breakdown.profitPercent}%`} />
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
      />
    </label>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <li className={`flex justify-between ${highlight ? "font-semibold text-teal-900" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </li>
  );
}
