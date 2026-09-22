import { describe, expect, it } from "vitest";
import type { Product } from "./products";
import { createCatalogExport } from "./catalog-export";

const product: Product = {
  id: "product-1",
  sku: "=HYPERLINK(\"evil\")",
  name: "Caneta; preta",
  channelId: "shopee",
  currentPrice: 20,
  draft: {
    version: 1,
    channelId: "shopee",
    tariffMode: "manual",
    confirmedDropOff: false,
    excludeTax: false,
    input: {
      mode: "margin_to_price",
      productCost: 25,
      packaging: 0,
      sellerShipping: 0,
      commissionPercent: 12,
      taxPercent: 0,
      fixedFee: 2,
      desiredMarginPercent: 20,
    },
  },
  result: {
    productCost: 25,
    packaging: 0,
    sellerShipping: 0,
    fixedFee: 2,
    commission: 3,
    tax: 0,
    netProfit: -5,
    profitPercent: -25,
    suggestedPrice: 35,
  },
  ruleId: "manual-v1",
  version: 1,
  archivedAt: "2026-09-22T00:00:00.000Z",
  editable: false,
  updatedAt: "2026-09-22T00:00:00.000Z",
};

describe("catalog export", () => {
  it("createCatalogExport_formulaLikeSku_escapesTextAndKeepsNumericLoss", () => {
    const csv = createCatalogExport([product]);
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
    expect(csv).toContain('"Caneta; preta"');
    expect(csv).toContain('"-5,00"');
    expect(csv).toContain('"ARQUIVADO"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("createCatalogExport_emptyCatalog_hasHeaderOnly", () => {
    const csv = createCatalogExport([]);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain("PRECO_SUGERIDO");
  });
});
