"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import channels from "@/data/channels.json";
import { createCatalogTemplate, MAX_CSV_BYTES } from "@/lib/catalog-csv";
import { parseBRNumber } from "@/lib/numbers";
import { formatBRL } from "@/lib/pricing";
import type { ChannelId } from "@/types/channels";

type PreviewRow = {
  line: number;
  sku: string;
  name: string;
  cost: number | null;
  quantity?: number | null;
  action: "create" | "update" | "invalid";
  errors: string[];
  oldPrice?: number | null;
  newPrice?: number | null;
};
type Preview = {
  previewId: string;
  rows: PreviewRow[];
  validCount: number;
  invalidCount: number;
  expiresAt: string;
};
type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { line: number; errors: string[] }[];
};
type Defaults = {
  channelId: ChannelId;
  commissionPercent: string;
  taxPercent: string;
  fixedFee: string;
  packaging: string;
  sellerShipping: string;
  desiredMarginPercent: string;
};
const initialDefaults: Defaults = {
  channelId: "mercado_livre",
  commissionPercent: "",
  taxPercent: "0",
  fixedFee: "0",
  packaging: "0",
  sellerShipping: "0",
  desiredMarginPercent: "20",
};

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Não foi possível importar. Tente novamente.");
  return data;
}

export function ImportCsv({
  plan,
  onImported,
}: {
  plan: "free" | "pro";
  onImported: () => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [defaults, setDefaults] = useState(initialDefaults);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [allowPartial, setAllowPartial] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([createCatalogTemplate()], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "modelo-produtos-preco-pronto.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function changeDefault(key: keyof Defaults, value: string) {
    setDefaults((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setResult(null);
  }
  function numericDefaults() {
    const keys = [
      "commissionPercent",
      "taxPercent",
      "fixedFee",
      "packaging",
      "sellerShipping",
      "desiredMarginPercent",
    ] as const;
    const numbers = Object.fromEntries(
      keys.map((key) => [key, parseBRNumber(defaults[key], key)]),
    );
    return { channelId: defaults.channelId, ...numbers };
  }
  async function prepare() {
    setError(null);
    setResult(null);
    setPreview(null);
    if (!file) {
      setError("Selecione um arquivo CSV.");
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setError("O CSV pode ter no máximo 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const csv = await file.text();
      const data = await post("/api/produtos/importar/preview", {
        csv,
        defaults: numericDefaults(),
        updateExisting,
      });
      setPreview(data as Preview);
      setAllowPartial(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CSV inválido.");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const imported = (await post("/api/produtos/importar/confirm", {
        previewId: preview.previewId,
        allowPartial,
      })) as ImportResult;
      setResult(imported);
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await onImported();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Importação não concluída.",
      );
    } finally {
      setBusy(false);
    }
  }
  const field = (key: keyof Defaults, label: string) => (
    <div className="field" key={key}>
      <label htmlFor={`csv-${key}`}>{label}</label>
      <input
        id={`csv-${key}`}
        inputMode="decimal"
        value={defaults[key]}
        onChange={(event) => changeDefault(key, event.target.value)}
      />
    </div>
  );

  return (
    <section className="catalog-import" aria-label="Importação de produtos">
      <div className="account-section-heading">
        <div>
          <p className="eyebrow">Atalho para organizar o catálogo</p>
          <h2>Traga seus produtos por CSV</h2>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={downloadTemplate}
        >
          Baixar modelo
        </button>
      </div>
      <p className="field-hint">
        Colunas SKU, PRODUTO e CUSTO; QTDE e MARGEM são opcionais. A quantidade
        não multiplica a taxa por pedido. Limite de 500 linhas e 2 MB, em UTF-8.
      </p>
      {plan === "free" ? (
        <p className="field-hint">
          Importação disponível no PRO. <Link href="/app/plano">Ver plano</Link>
        </p>
      ) : (
        <>
          <button
            type="button"
            className="text-button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
          >
            {open ? "Fechar importação" : "Importar meu CSV"}
          </button>
          {open && (
            <div className="catalog-import-form">
              <div className="field">
                <label htmlFor="csv-file">Arquivo CSV</label>
                <input
                  id="csv-file"
                  type="file"
                  ref={fileInput}
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setPreview(null);
                    setResult(null);
                  }}
                />
              </div>
              <p className="field-hint">
                Todos os itens recebem as taxas abaixo. A margem da linha,
                quando informada, substitui a margem padrão.
              </p>
              <div className="fields-grid">
                <div className="field">
                  <label htmlFor="csv-channelId">Canal</label>
                  <select
                    id="csv-channelId"
                    value={defaults.channelId}
                    onChange={(event) =>
                      changeDefault("channelId", event.target.value)
                    }
                  >
                    {(
                      Object.entries(channels) as [ChannelId, { label: string }][]
                    ).map(([id, channel]) => (
                      <option key={id} value={id}>
                        {channel.label}
                      </option>
                    ))}
                  </select>
                </div>
                {field("commissionPercent", "Comissão (%)")}
                {field("taxPercent", "Imposto (%)")}
                {field("fixedFee", "Taxa fixa por unidade (R$)")}
                {field("packaging", "Embalagem (R$)")}
                {field("sellerShipping", "Frete pago por você (R$)")}
                {field("desiredMarginPercent", "Margem padrão (%)")}
              </div>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(event) => {
                    setUpdateExisting(event.target.checked);
                    setPreview(null);
                  }}
                />
                <span>
                  Atualizar produtos com SKU já cadastrado. Sem marcar, eles
                  serão apontados como duplicados.
                </span>
              </label>
              <button
                type="button"
                className="button primary"
                onClick={prepare}
                disabled={busy}
              >
                {busy ? "Preparando…" : "Revisar antes de salvar"}
              </button>
              {error && <p role="alert" className="error-banner">{error}</p>}
              {preview && (
                <div className="catalog-import-preview">
                  <h3>Revise as {preview.rows.length} linhas</h3>
                  <p>
                    {preview.validCount} pronta(s), {preview.invalidCount} com
                    erro. A prévia expira em{" "}
                    {new Date(preview.expiresAt).toLocaleTimeString("pt-BR")}.
                  </p>
                  <div className="catalog-import-table-wrap">
                    <table>
                      <thead>
                        <tr><th>Linha</th><th>SKU / produto</th><th>Custo</th><th>Ação</th><th>Preço sugerido</th><th>Problema</th></tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={`${row.line}-${row.sku}`}>
                            <td>{row.line}</td>
                            <td><strong>{row.sku}</strong><br />{row.name}</td>
                            <td>{row.cost == null ? "—" : formatBRL(row.cost)}</td>
                            <td>{row.action === "create" ? "Criar" : row.action === "update" ? "Atualizar" : "Ignorar"}</td>
                            <td>
                              {row.newPrice == null
                                ? "—"
                                : row.action === "update" && row.oldPrice != null
                                  ? `${formatBRL(row.oldPrice)} → ${formatBRL(row.newPrice)}`
                                  : formatBRL(row.newPrice)}
                            </td>
                            <td>{row.errors.join("; ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.invalidCount > 0 && (
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={allowPartial}
                        onChange={(event) => setAllowPartial(event.target.checked)}
                      />
                      <span>Salvar somente as linhas válidas e ignorar as demais.</span>
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
                <p role="status" className="success-banner">
                  {result.created} criado(s), {result.updated} atualizado(s),
                  {result.skipped} ignorado(s).
                  {result.errors.length > 0 &&
                    ` ${result.errors.map((entry) => `Linha ${entry.line}: ${entry.errors.join("; ")}`).join(" ")}`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
