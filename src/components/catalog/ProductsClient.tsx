"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import channels from "@/data/channels.json";
import type { ChannelId } from "@/types/channels";
import { parseBRNumber } from "@/lib/numbers";
import {
  calculatePricing,
  formatBRL,
  type PricingInput,
  type PricingBreakdown,
} from "@/lib/pricing";
import { resolveFixedFee, type TariffMode, mlDropOffRule } from "@/lib/tariffs";
import type { SimulationDraft } from "@/lib/simulation-draft";
import { ImportCsv } from "./ImportCsv";
import { BatchReprice } from "./BatchReprice";

type Product = {
  id: string;
  sku: string;
  name: string;
  channelId: ChannelId;
  currentPrice?: number | null;
  draft: SimulationDraft;
  result: PricingBreakdown;
  ruleId: string;
  version: number;
  archivedAt?: string | null;
  editable: boolean;
  updatedAt: string;
};
type Entitlement = {
  plan: "free" | "pro";
  limit: number;
  count: number;
  archivedCount: number;
  requiresSelection: boolean;
  selectedEditableCount: number;
};
type ProductList = { products: Product[]; entitlement: Entitlement };
type Status = "active" | "archived" | "all";
type Inputs = {
  sku: string;
  name: string;
  channelId: ChannelId;
  tariffMode: TariffMode;
  confirmedDropOff: boolean;
  productCost: string;
  packaging: string;
  sellerShipping: string;
  commissionPercent: string;
  taxPercent: string;
  fixedFee: string;
  desiredMarginPercent: string;
  currentPrice: string;
  excludeTax: boolean;
};
const blank: Inputs = {
  sku: "",
  name: "",
  channelId: "mercado_livre",
  tariffMode: "manual",
  confirmedDropOff: false,
  productCost: "",
  packaging: "0",
  sellerShipping: "0",
  commissionPercent: "",
  taxPercent: "0",
  fixedFee: "0",
  desiredMarginPercent: "20",
  currentPrice: "",
  excludeTax: false,
};
const labels: Partial<Record<keyof Inputs, string>> = {
  sku: "SKU",
  name: "Nome do produto",
  productCost: "Custo do produto (R$)",
  packaging: "Embalagem (R$)",
  sellerShipping: "Frete pago por você (R$)",
  commissionPercent: "Comissão (%)",
  taxPercent: "Imposto (%)",
  fixedFee: "Taxa fixa por unidade (R$)",
  desiredMarginPercent: "Margem desejada (%)",
  currentPrice: "Preço publicado por você (opcional, R$)",
};
function toInputs(product: Product): Inputs {
  const d = product.draft;
  return {
    sku: product.sku,
    name: product.name,
    channelId: product.channelId,
    tariffMode: d.tariffMode,
    confirmedDropOff: d.confirmedDropOff,
    productCost: String(d.input.productCost),
    packaging: String(d.input.packaging),
    sellerShipping: String(d.input.sellerShipping),
    commissionPercent: String(d.input.commissionPercent),
    taxPercent: String(d.input.taxPercent),
    fixedFee: String(d.input.fixedFee),
    desiredMarginPercent: String(d.input.desiredMarginPercent),
    currentPrice:
      product.currentPrice == null ? "" : String(product.currentPrice),
    excludeTax: d.excludeTax,
  };
}
function buildPayload(values: Inputs) {
  const number = (key: keyof Inputs) =>
    parseBRNumber(values[key] as string, labels[key] || "Valor");
  const fixedFee = values.tariffMode === "ml_drop_off" ? 0 : number("fixedFee");
  const input: PricingInput = {
    mode: "margin_to_price",
    productCost: number("productCost"),
    packaging: number("packaging"),
    sellerShipping: number("sellerShipping"),
    commissionPercent: number("commissionPercent"),
    taxPercent: values.excludeTax ? 0 : number("taxPercent"),
    fixedFee,
    desiredMarginPercent: number("desiredMarginPercent"),
  };
  if (values.channelId !== "mercado_livre" && values.tariffMode !== "manual")
    throw new Error("A regra ME2 Drop Off é exclusiva de Mercado Livre.");
  input.fixedFee = resolveFixedFee(
    values.tariffMode,
    input.fixedFee,
    values.confirmedDropOff,
  ).amount;
  const draft: SimulationDraft = {
    version: 1,
    channelId: values.channelId,
    tariffMode: values.tariffMode,
    confirmedDropOff: values.confirmedDropOff,
    excludeTax: values.excludeTax,
    input,
  };
  const sku = values.sku.trim(),
    name = values.name.trim();
  if (!sku || sku.length > 64 || !name || name.length > 160)
    throw new Error(
      "Informe SKU de até 64 caracteres e nome de até 160 caracteres.",
    );
  const currentPrice = values.currentPrice.trim()
    ? number("currentPrice")
    : null;
  const result = calculatePricing(input);
  return { sku, name, draft, currentPrice, result };
}
async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error || "Não foi possível concluir. Tente novamente.",
    );
  return data;
}
export function ProductsClient() {
  const requestSequence = useRef(0);
  const [data, setData] = useState<ProductList | null>(null),
    [status, setStatus] = useState<Status>("active"),
    [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null),
    [creating, setCreating] = useState(false),
    [values, setValues] = useState<Inputs>(blank),
    [preview, setPreview] = useState<PricingBreakdown | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (query.trim()) params.set("q", query.trim());
      const result = await api(`/api/produtos?${params}`);
      if (requestSequence.current === sequence) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (requestSequence.current === sequence)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível carregar seus produtos.",
        );
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }, [status, query]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  function change<K extends keyof Inputs>(key: K, value: Inputs[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setError(null);
  }
  function openNew() {
    setEditing(null);
    setValues(blank);
    setPreview(null);
    setCreating(true);
    setError(null);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setValues(toInputs(p));
    setPreview(null);
    setCreating(true);
    setError(null);
  }
  function changeChannel(channelId: ChannelId) {
    setValues((current) => ({
      ...current,
      channelId,
      tariffMode: channelId === "mercado_livre" ? current.tariffMode : "manual",
      confirmedDropOff: channelId === "mercado_livre" ? current.confirmedDropOff : false,
    }));
    setPreview(null);
    setError(null);
  }
  function close() {
    setCreating(false);
    setEditing(null);
    setPreview(null);
    setError(null);
  }
  function showPreview() {
    try {
      setPreview(buildPayload(values).result);
      setError(null);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Revise os campos.");
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    let payload;
    try {
      payload = buildPayload(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revise os valores.");
      return;
    }
    setBusy(true);
    try {
      await api(editing ? `/api/produtos/${editing.id}` : "/api/produtos", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          sku: payload.sku,
          name: payload.name,
          draft: payload.draft,
          currentPrice: payload.currentPrice,
          version: editing?.version,
        }),
      });
      setNotice(
        editing
          ? "Produto atualizado. O resultado anterior foi preservado no histórico."
          : "Produto salvo no seu catálogo.",
      );
      close();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function archive(p: Product) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/produtos/${p.id}/archive`, {
        method: "POST",
        body: JSON.stringify({ version: p.version, archived: !p.archivedAt }),
      });
      setNotice(
        p.archivedAt
          ? "Produto restaurado."
          : "Produto arquivado. Você pode restaurá-lo.",
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível alterar o produto.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function chooseEditable() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/produtos/selecionar-editaveis", {
        method: "POST",
        body: JSON.stringify({ ids: selected }),
      });
      setSelected([]);
      setNotice(
        "Produtos editáveis selecionados. Os demais continuam em leitura.",
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Selecione até cinco produtos da sua conta.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv(ids?: string[]) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/produtos/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Não foi possível exportar o CSV.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "precos-liquido.csv";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("CSV gerado. Confira os preços antes de atualizar seus anúncios.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível exportar o CSV.",
      );
    } finally {
      setBusy(false);
    }
  }
  function input(key: keyof Inputs, placeholder?: string) {
    return (
      <div className="field">
        <label htmlFor={`product-${key}`}>{labels[key]}</label>
        <input
          id={`product-${key}`}
          value={values[key] as string}
          onChange={(e) => change(key, e.target.value as never)}
          inputMode={
            [
              "productCost",
              "packaging",
              "sellerShipping",
              "commissionPercent",
              "taxPercent",
              "fixedFee",
              "desiredMarginPercent",
              "currentPrice",
            ].includes(key)
              ? "decimal"
              : undefined
          }
          placeholder={placeholder}
          autoComplete="off"
          required={[
            "sku",
            "name",
            "productCost",
            "commissionPercent",
            "desiredMarginPercent",
          ].includes(key)}
        />
      </div>
    );
  }
  const items = data?.products ?? [];
  return (
    <div className="catalog-app">
      <div className="account-title">
        <p className="eyebrow">Seu catálogo</p>
        <h1>Um preço para cada produto.</h1>
        <p>
          Confira custos e margem antes de alterar o preço nos seus anúncios.
        </p>
      </div>
      <div className="catalog-tools">
        <div className="field">
          <label htmlFor="catalog-search">Buscar por nome ou SKU</label>
          <input
            id="catalog-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex.: CAMISETA-P"
          />
        </div>
        <div className="field">
          <label htmlFor="catalog-status">Exibir</label>
          <select
            id="catalog-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            <option value="active">Ativos</option>
            <option value="archived">Arquivados</option>
            <option value="all">Todos</option>
          </select>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={openNew}
          disabled={
            busy ||
            Boolean(data && data.entitlement.count >= data.entitlement.limit)
          }
        >
          Novo produto
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => void exportCsv()}
          disabled={busy || loading}
        >
          Exportar catálogo
        </button>
      </div>
      {data && (
        <p className="catalog-count" role="status">
          {data.entitlement.count} de {data.entitlement.limit} produtos ativos
          no plano {data.entitlement.plan.toUpperCase()}.{" "}
          {data.entitlement.archivedCount} arquivado(s).{" "}
          {data.entitlement.plan === "free" && (
            <Link href="/app/plano"> Conheça o PRO</Link>
          )}
        </p>
      )}
      {data && <ImportCsv plan={data.entitlement.plan} onImported={refresh} />}
      {data?.entitlement.requiresSelection && (
        <section className="selection-banner">
          <h2>Escolha até cinco para continuar editando</h2>
          <p>
            Seu catálogo continua disponível em leitura. Marque os produtos que
            deseja manter editáveis no Free.
          </p>
          <button
            className="button secondary"
            disabled={busy || selected.length > 5 || selected.length === 0}
            onClick={chooseEditable}
          >
            Manter {selected.length} editável(is)
          </button>
        </section>
      )}
      {data?.entitlement.plan === "pro" && selected.length > 0 && (
        <>
          <button
            type="button"
            className="button secondary"
            onClick={() => void exportCsv(selected)}
            disabled={busy}
          >
            Exportar {selected.length} selecionado(s)
          </button>
          <BatchReprice
            key={selected.join(",")}
            ids={selected}
            onCommitted={refresh}
          />
        </>
      )}
      {notice && (
        <p role="status" className="success-banner">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {creating && (
        <section
          className="catalog-editor"
          aria-label={editing ? "Editar produto" : "Novo produto"}
        >
          <div className="account-section-heading">
            <h2>{editing ? "Editar produto" : "Novo produto"}</h2>
            <button type="button" className="text-button" onClick={close}>
              Fechar
            </button>
          </div>
          <form onSubmit={submit} noValidate>
            <div className="fields-grid">
              {input("sku", "Ex.: CAMISETA-P")}
              {input("name", "Ex.: Camiseta P")}
            </div>
            <div className="fields-grid">
              <div className="field">
                <label htmlFor="product-channel">Canal</label>
                <select
                  id="product-channel"
                  value={values.channelId}
                  onChange={(e) => changeChannel(e.target.value as ChannelId)}
                >
                  {(
                    Object.entries(channels) as [ChannelId, { label: string }][]
                  ).map(([key, c]) => (
                    <option key={key} value={key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              {values.channelId === "mercado_livre" && (
                <div className="field">
                  <label htmlFor="product-tariff">Custo fixo</label>
                  <select
                    id="product-tariff"
                    value={values.tariffMode}
                    onChange={(e) => {
                      change("tariffMode", e.target.value as TariffMode);
                      change("confirmedDropOff", false);
                    }}
                  >
                    <option value="manual">Informar manualmente</option>
                    <option value="ml_drop_off">ME2 Drop Off verificado</option>
                  </select>
                </div>
              )}
            </div>
            {values.tariffMode === "ml_drop_off" && (
              <div className="catalog-rule">
                <p>
                  Somente para Mercado Envios ME2 Drop Off, sem Flex. Custo fixo
                  R$ 0; comissão, frete e imposto continuam informados por você.
                  Regra revista até {mlDropOffRule.reviewBy}.
                </p>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={values.confirmedDropOff}
                    onChange={(e) =>
                      change("confirmedDropOff", e.target.checked)
                    }
                  />
                  <span>
                    Conferi no anúncio que a logística é ME2 Drop Off sem Flex.
                  </span>
                </label>
              </div>
            )}
            <div className="fields-grid">
              {input("productCost")}
              {input("packaging")}
              {input("sellerShipping")}
              {input("commissionPercent")}
              {values.tariffMode === "manual" && input("fixedFee")}
              {!values.excludeTax && input("taxPercent")}
              {input("desiredMarginPercent")}
              {input("currentPrice")}
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={values.excludeTax}
                onChange={(e) => change("excludeTax", e.target.checked)}
              />
              <span>Simular sem imposto. Sei que ele não será incluído.</span>
            </label>
            {preview && (
              <p className="catalog-preview" role="status">
                Preço sugerido:{" "}
                <strong>{formatBRL(preview.suggestedPrice)}</strong> ·
                contribuição estimada:{" "}
                <strong>{formatBRL(preview.netProfit)}</strong>. Confira taxas
                da sua conta.
              </p>
            )}
            <div className="account-actions">
              <button
                type="button"
                className="button secondary"
                onClick={showPreview}
              >
                Conferir cálculo
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy
                  ? "Salvando…"
                  : editing
                    ? "Salvar alterações"
                    : "Salvar produto"}
              </button>
            </div>
          </form>
        </section>
      )}
      {loading ? (
        <p role="status" className="catalog-loading">
          Carregando seus produtos…
        </p>
      ) : items.length === 0 ? (
        <div className="account-empty">
          <h2>
            {status === "archived"
              ? "Nenhum produto arquivado."
              : query
                ? "Nenhum produto encontrado."
                : "Comece com um produto."}
          </h2>
          <p>
            {query
              ? "Tente outro SKU ou nome."
              : "Guarde custo, taxas e margem para revisar quando o fornecedor alterar o preço."}
          </p>
          {!query && status === "active" && (
            <button className="button primary" onClick={openNew} disabled={busy || Boolean(data && data.entitlement.count >= data.entitlement.limit)}>
              Adicionar primeiro produto
            </button>
          )}
        </div>
      ) : (
        <ul className="catalog-list">
          {items.map((p) => (
            <li key={p.id} className={p.archivedAt ? "archived" : ""}>
              <div className="catalog-product-head">
                {(data?.entitlement.requiresSelection || data?.entitlement.plan === "pro") && !p.archivedAt && (
                  <label className="catalog-selector">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, p.id]
                            : current.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span className="sr-only">
                      Selecionar {p.name} {data?.entitlement.plan === "pro" ? "para operação em lote" : "para edição"}
                    </span>
                  </label>
                )}
                <div>
                  <strong>{p.name}</strong>
                  <p>
                    {p.sku} · {channels[p.channelId]?.label || p.channelId}{" "}
                    {p.archivedAt ? "· Arquivado" : ""}
                  </p>
                </div>
              </div>
              <div className="catalog-values">
                <span>Custo {formatBRL(p.draft.input.productCost)}</span>
                <span>
                  Sugerido <strong>{formatBRL(p.result.suggestedPrice)}</strong>
                </span>
                <span>
                  Contribuição{" "}
                  <strong className={p.result.netProfit < 0 ? "negative" : ""}>
                    {formatBRL(p.result.netProfit)}
                  </strong>
                </span>
              </div>
              <div className="catalog-actions">
                <button
                  className="text-button"
                  type="button"
                  disabled={busy || !p.editable}
                  onClick={() => openEdit(p)}
                >
                  Editar
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={busy}
                  onClick={() => archive(p)}
                >
                  {p.archivedAt ? "Restaurar" : "Arquivar"}
                </button>
              </div>
              {!p.editable && (
                <p className="field-hint">
                  {p.archivedAt
                    ? "Produto arquivado. Restaure para voltar a editar."
                    : "Edição indisponível; escolha este produto entre os cinco editáveis no Free."}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">
        Resultados são estimativas. Preços não são publicados automaticamente
        nos marketplaces.
      </p>
    </div>
  );
}
