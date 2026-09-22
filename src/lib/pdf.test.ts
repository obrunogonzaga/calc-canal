import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBreakdownPdf } from "./pdf";
const calls = vi.hoisted(() => ({
  text: vi.fn(),
  setFontSize: vi.fn(),
  splitTextToSize: vi.fn((value: string) => [value]),
  addPage: vi.fn(),
  save: vi.fn(),
}));
vi.mock("jspdf", () => ({
  jsPDF: class {
    text = calls.text;
    setFontSize = calls.setFontSize;
    splitTextToSize = calls.splitTextToSize;
    addPage = calls.addPage;
    save = calls.save;
  },
}));
beforeEach(() => vi.clearAllMocks());
describe("downloadBreakdownPdf", () => {
  it("downloadBreakdownPdf_snapshot_rendersAmountsPremisesAndBrand", () => {
    downloadBreakdownPdf({
      channel: "Mercado Livre",
      mode: "price_to_profit",
      createdAt: "2026-09-22T12:00:00Z",
      breakdown: {
        productCost: 50,
        packaging: 3,
        sellerShipping: 0,
        fixedFee: 6,
        commission: 16,
        tax: 6,
        netProfit: 19,
        profitPercent: 19,
        suggestedPrice: 100,
      },
      assumptions: ["manual-v1", "Taxas do usuário"],
    });
    const text = calls.text.mock.calls.map((c) => c[0]).join(" ");
    expect(text).toContain("PreçoPronto");
    expect(text).toContain("manual-v1");
    expect(text).toMatch(/Contribuição estimada: R\$\s*19,00/);
    expect(text).toContain("São Paulo");
    expect(calls.save).toHaveBeenCalledWith("precopronto-simulacao.pdf");
  });
  it("downloadBreakdownPdf_longPremises_addsPages", () => {
    downloadBreakdownPdf({
      channel: "Shopee",
      mode: "price_to_profit",
      createdAt: "2026-09-22T12:00:00Z",
      breakdown: {
        productCost: 1,
        packaging: 0,
        sellerShipping: 0,
        fixedFee: 0,
        commission: 0,
        tax: 0,
        netProfit: 1,
        profitPercent: 50,
        suggestedPrice: 2,
      },
      assumptions: Array(50).fill(
        "Premissa que precisa aparecer no documento.",
      ),
    });
    expect(calls.addPage).toHaveBeenCalled();
    expect(
      calls.text.mock.calls.filter(
        (c) => c[0] === "Premissa que precisa aparecer no documento.",
      ),
    ).toHaveLength(50);
  });
});
