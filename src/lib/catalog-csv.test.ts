import { describe, expect, it } from "vitest";
import {
  parseCatalogCsv,
  escapeCsvCell,
  createCatalogTemplate,
} from "./catalog-csv";
describe("catalog CSV", () => {
  it("parseCatalogCsv_semicolonWithBrazilianDecimal_readsLines", () => {
    const r = parseCatalogCsv(
      "SKU;PRODUTO;CUSTO;Qtde;Margem\r\nA;Caderno;1.234,56;2;20\r\nB;Caneta;4,50;;\r\n",
    );
    expect(r.validCount).toBe(2);
    expect(r.rows[0]).toMatchObject({
      sku: "A",
      cost: 1234.56,
      quantity: 2,
      desiredMarginPercent: 20,
    });
  });
  it("parseCatalogCsv_quotedCommaAndNewline_preservesText", () => {
    const r = parseCatalogCsv(
      'SKU,PRODUTO,CUSTO\nA,"Bolsa, nova\nedição",12.50\n',
    );
    expect(r.rows[0].name).toBe("Bolsa, nova\nedição");
    expect(r.validCount).toBe(1);
  });
  it("parseCatalogCsv_duplicateCaseAndBadNumber_reportsRows", () => {
    const r = parseCatalogCsv("SKU;PRODUTO;CUSTO\na;Item;1\nA;Item;-2\n");
    expect(r.invalidCount).toBe(1);
    expect(r.rows[1].errors.join(" ")).toContain("SKU repetido");
    expect(r.rows[1].errors.join(" ")).toContain("custo inválido");
  });
  it("parseCatalogCsv_extraColumnAndMissingHeader_rejectsInvalid", () => {
    const r = parseCatalogCsv("SKU;PRODUTO;CUSTO\na;Item;1;extra");
    expect(r.invalidCount).toBe(1);
    expect(() => parseCatalogCsv("produto;preço\na;1")).toThrow(
      "Cabeçalho obrigatório",
    );
  });
  it("parseCatalogCsv_bomAndQuotedSeparator_supportsTemplate", () => {
    const r = parseCatalogCsv(
      createCatalogTemplate() + 'x;"Peça; grande";3,40;1;10',
    );
    expect(r.rows[0].name).toBe("Peça; grande");
    expect(r.rows[0].cost).toBe(3.4);
  });
  it("parseCatalogCsv_aliasHeaders_acceptsUnitCost", () => {
    const result = parseCatalogCsv("SKU;NOME;CUSTO UNITÁRIO\nP1;Produto;10,50");
    expect(result.rows[0]).toMatchObject({ sku: "P1", name: "Produto", cost: 10.5 });
  });
  it.each([
    'SKU;PRODUTO;CUSTO\na;"Sem;5',
    'SKU;PRODUTO;CUSTO\na;"Fechado"extra;5',
  ])("parseCatalogCsv_malformedQuote_rejects", (csv) => {
    expect(() => parseCatalogCsv(csv)).toThrow(/aspas/i);
  });
  it("parseCatalogCsv_moreThan500_rejects", () => {
    const csv =
      "SKU;PRODUTO;CUSTO\n" +
      Array.from({ length: 501 }, (_, i) => `${i};Item;1`).join("\n");
    expect(() => parseCatalogCsv(csv)).toThrow("500");
  });
  it("parseCatalogCsv_invalidQuantityAndMargin_marksRows", () => {
    const r = parseCatalogCsv("SKU;PRODUTO;CUSTO;QTDE;MARGEM\na;Item;1;0;100");
    expect(r.rows[0].errors.join(" ")).toContain("quantidade");
    expect(r.rows[0].errors.join(" ")).toContain("margem");
  });
  it("parseCatalogCsv_binaryAndOversizedInput_rejects", () => {
    expect(() => parseCatalogCsv("SKU;PRODUTO;CUSTO\nA;Te\uFFFDxto;1")).toThrow(
      "UTF-8",
    );
    expect(() => parseCatalogCsv("a".repeat(2_000_001))).toThrow("2 MB");
  });
  it.each(["=1+1", "+SUM(A1:A2)", "-1+1", "@SUM(A1)", "\t=HYPERLINK()"])(
    "escapeCsvCell_formulaLikeText_prefixesApostrophe",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value}"`);
    },
  );
  it("escapeCsvCell_quotesAndDelimiter_escapesSafely", () => {
    expect(escapeCsvCell('Tamanho "G"; azul')).toBe('"Tamanho ""G""; azul"');
  });
});
