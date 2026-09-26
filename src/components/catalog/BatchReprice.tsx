"use client";

import { useState } from "react";
import { parseBRNumber } from "@/lib/numbers";
import { formatBRL } from "@/lib/pricing";

type ChangeKey =
  | "costAdjustmentPercent"
  | "desiredMarginPercent"
  | "commissionPercent"
  | "taxPercent"
  | "fixedFee";
type ChangeValues = Record<ChangeKey, string> & {
  tariffMode: "keep" | "manual" | "ml_drop_off";
  confirmedDropOff: boolean;
};
type PreviewRow = {
  id: string;
  sku: string;
  name: string;
  oldCost: number | null;
  currentPrice: number | null;
  newCost: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  oldProfit: number | null;
  newProfit: number | null;
  belowTarget: boolean;
  errors: string[];
};
type Preview = {
  previewId: string;
  rows: PreviewRow[];
  validCount: number;
  invalidCount: number;
  expiresAt: string;
};
type Result = {
  updated: number;
  skipped: number;
  errors: { id: string; sku?: string; errors: string[] }[];
};
const initial: ChangeValues = {
  costAdjustmentPercent: "",
  desiredMarginPercent: "",
  commissionPercent: "",
  taxPercent: "",
  fixedFee: "",
  tariffMode: "keep",
  confirmedDropOff: false,
};
const fields: { key: ChangeKey; label: string; placeholder: string }[] = [
  { key: "costAdjustmentPercent", label: "Alteração de custo (%)", placeholder: "Ex.: 10 ou -5" },
  { key: "desiredMarginPercent", label: "Nova margem (%)", placeholder: "Manter a atual" },
  { key: "commissionPercent", label: "Nova comissão (%)", placeholder: "Manter a atual" },
  { key: "taxPercent", label: "Novo imposto (%)", placeholder: "Manter o atual" },
  { key: "fixedFee", label: "Nova taxa fixa (R$)", placeholder: "Manter a atual" },
];
async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Não foi possível recalcular. Tente novamente.");
  return data;
}
function signedPercent(value: string): number {
  const trimmed = value.trim().replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(trimmed))
    throw new Error("A alteração de custo deve ser um percentual válido.");
  const result = Number(trimmed);
  if (!Number.isFinite(result) || result < -100)
    throw new Error("A alteração de custo não pode reduzir mais de 100%.");
  return result;
}
function displayMoney(value: number | null): string {
  return value === null ? "—" : formatBRL(value);
}

export function BatchReprice({
  ids,
  onCommitted,
}: {
  ids: string[];
  onCommitted: () => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [allowPartial, setAllowPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change<K extends keyof ChangeValues>(key: K, value: ChangeValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setResult(null);
    setError(null);
  }
  function buildChanges() {
    const changes: Record<string, number | string | boolean> = {};
    for (const field of fields) {
      const raw = values[field.key].trim();
      if (!raw) continue;
      changes[field.key] = field.key === "costAdjustmentPercent"
        ? signedPercent(raw)
        : parseBRNumber(raw, field.label);
    }
    if (values.tariffMode !== "keep") {
      changes.tariffMode = values.tariffMode;
      changes.confirmedDropOff =
        values.tariffMode === "ml_drop_off" && values.confirmedDropOff;
    }
    if (Object.keys(changes).length === 0)
      throw new Error("Informe pelo menos uma mudança para recalcular.");
    return changes;
  }
  async function prepare() {
    setBusy(true);
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      const data = await post("/api/produtos/recalcular/preview", {
        ids,
        changes: buildChanges(),
      });
      setPreview(data as Preview);
      setAllowPartial(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a prévia.");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const updated = (await post("/api/produtos/recalcular/confirm", {
        previewId: preview.previewId,
        allowPartial,
      })) as Result;
      setResult({
        ...updated,
        errors: updated.errors.map((entry) => ({
          ...entry,
          sku: preview.rows.find((row) => row.id === entry.id)?.sku,
        })),
      });
      setPreview(null);
      await onCommitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o recálculo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="catalog-batch" aria-label="Recálculo em lote">
      <p className="eyebrow">PRO · {ids.length} selecionado(s)</p>
      <h2>Atualize os preços de uma vez</h2>
      <p className="field-hint">
        Campos vazios mantêm a configuração individual. A prévia não altera seus produtos.
      </p>
      <div className="fields-grid">
        {fields.map((field) => (
          <div className="field" key={field.key}>
            <label htmlFor={`batch-${field.key}`}>{field.label}</label>
            <input
              id={`batch-${field.key}`}
              inputMode="decimal"
              value={values[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => change(field.key, event.target.value)}
            />
          </div>
        ))}
        <div className="field">
          <label htmlFor="batch-tariff-mode">Regra de taxa fixa</label>
          <select
            id="batch-tariff-mode"
            value={values.tariffMode}
            onChange={(event) =>
              change("tariffMode", event.target.value as ChangeValues["tariffMode"])
            }
          >
            <option value="keep">Manter por produto</option>
            <option value="manual">Usar taxa manual</option>
            <option value="ml_drop_off">ME2 Drop Off verificado</option>
          </select>
        </div>
      </div>
      {values.tariffMode === "ml_drop_off" && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={values.confirmedDropOff}
            onChange={(event) => change("confirmedDropOff", event.target.checked)}
          />
          <span>Conferi que todos os selecionados são Mercado Envios ME2 Drop Off sem Flex.</span>
        </label>
      )}
      <button type="button" className="button primary" onClick={prepare} disabled={busy || ids.length === 0}>
        {busy ? "Calculando…" : "Comparar antes e depois"}
      </button>
      {error && <p role="alert" className="error-banner">{error}</p>}
      {preview && (
        <div className="catalog-batch-preview">
          <h3>Revise o resultado</h3>
          <p>{preview.validCount} pronto(s), {preview.invalidCount} com erro. A situação da margem considera o preço publicado, quando informado. Ele não muda automaticamente.</p>
          <p className="field-hint">Deslize ou use as setas na tabela para ver todas as colunas.</p>
          <div className="catalog-import-table-wrap" role="region" aria-label="Resultados do recálculo" tabIndex={0}>
            <table>
              <thead>
                <tr><th>Produto</th><th>Custo antes → depois</th><th>Sugerido antes → depois</th><th>Contribuição antes → depois</th><th>Preço publicado</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.sku}</strong><br />{row.name}</td>
                    <td>{displayMoney(row.oldCost)} → {displayMoney(row.newCost)}</td>
                    <td>{displayMoney(row.oldPrice)} → {displayMoney(row.newPrice)}</td>
                    <td>{displayMoney(row.oldProfit)} → {displayMoney(row.newProfit)}</td>
                    <td>{displayMoney(row.currentPrice)}<br />{row.errors.length ? row.errors.join("; ") : row.belowTarget ? "Abaixo da margem alvo" : "Sem alerta de margem"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.invalidCount > 0 && (
            <label className="checkbox-field">
              <input type="checkbox" checked={allowPartial} onChange={(event) => setAllowPartial(event.target.checked)} />
              <span>Salvar só os produtos válidos e ignorar os demais.</span>
            </label>
          )}
          <button
            type="button"
            className="button primary"
            disabled={busy || preview.validCount === 0 || (preview.invalidCount > 0 && !allowPartial)}
            onClick={confirm}
          >
            {busy ? "Salvando…" : `Confirmar ${preview.validCount} produto(s)`}
          </button>
        </div>
      )}
      {result && (
        <div role="status" className="success-banner">
          <p>{result.updated} atualizado(s), {result.skipped} ignorado(s).</p>
          {result.errors.length > 0 && (
            <ul>
              {result.errors.map((entry) => (
                <li key={entry.id}>
                  {entry.sku || entry.id}: {entry.errors.join("; ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
