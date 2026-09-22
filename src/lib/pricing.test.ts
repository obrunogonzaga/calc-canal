import { describe, expect, it } from "vitest";

import {
  calculatePricing,
  formatBRL,
  type PricingInput,
} from "./pricing";

const validInput: PricingInput = {
  productCost: 10,
  packaging: 0,
  sellerShipping: 0,
  desiredMarginPercent: 20,
  taxPercent: 6,
  commissionPercent: 16,
  fixedFee: 0,
  mode: "margin_to_price",
};

describe("calculatePricing", () => {
  it("calculatePricing_marginToPrice_minimumCentResult", () => {
    const result = calculatePricing(validInput);
    const oneCentLower = calculatePricing({
      ...validInput,
      mode: "price_to_profit",
      salePrice: result.suggestedPrice - 0.01,
    });

    expect(result).toMatchObject({
      suggestedPrice: 17.24,
      commission: 2.76,
      tax: 1.03,
      netProfit: 3.45,
    });
    expect(result.profitPercent).toBeGreaterThanOrEqual(
      validInput.desiredMarginPercent
    );
    expect(oneCentLower.profitPercent).toBeLessThan(
      validInput.desiredMarginPercent
    );
  });

  it("calculatePricing_priceToProfit_roundedChargesResult", () => {
    const result = calculatePricing({
      ...validInput,
      productCost: 0,
      desiredMarginPercent: 0,
      commissionPercent: 12.5,
      taxPercent: 6.5,
      mode: "price_to_profit",
      salePrice: 10.01,
    });

    expect(result).toMatchObject({
      commission: 1.25,
      tax: 0.65,
      netProfit: 8.11,
      profitPercent: 81.02,
      suggestedPrice: 10.01,
    });
  });

  it("calculatePricing_priceToProfit_lossResult", () => {
    const result = calculatePricing({
      ...validInput,
      desiredMarginPercent: 0,
      commissionPercent: 10,
      taxPercent: 0,
      mode: "price_to_profit",
      salePrice: 10,
    });

    expect(result.netProfit).toBe(-1);
    expect(result.profitPercent).toBe(-10);
  });

  it("calculatePricing_invalidAmountsAndRates_error", () => {
    expect(() =>
      calculatePricing({ ...validInput, productCost: -0.01 })
    ).toThrow("não pode ser negativo");
    expect(() =>
      calculatePricing({ ...validInput, taxPercent: Number.POSITIVE_INFINITY })
    ).toThrow("número finito");
    expect(() => calculatePricing({ ...validInput, commissionPercent: 100 })).toThrow(
      "menor que 100%"
    );
  });

  it("calculatePricing_unviableMarginRate_error", () => {
    expect(() =>
      calculatePricing({
        ...validInput,
        commissionPercent: 60,
        taxPercent: 20,
        desiredMarginPercent: 20,
      })
    ).toThrow("Soma de comissão");
  });

  it("calculatePricing_unviableContributionRates_error", () => {
    expect(() =>
      calculatePricing({
        ...validInput,
        commissionPercent: 70,
        taxPercent: 30,
        mode: "price_to_profit",
        salePrice: 100,
      })
    ).toThrow("Soma de comissão e imposto");
  });

  it("calculatePricing_missingSalePrice_error", () => {
    expect(() =>
      calculatePricing({ ...validInput, mode: "price_to_profit", salePrice: 0 })
    ).toThrow("preço de venda válido");
  });

  it("calculatePricing_nearRateLimit_finiteResult", () => {
    const result = calculatePricing({
      ...validInput,
      desiredMarginPercent: 0,
      commissionPercent: 99.99,
      taxPercent: 0,
      productCost: 1,
    });

    expect(Number.isFinite(result.suggestedPrice)).toBe(true);
    expect(result.suggestedPrice).toBeGreaterThan(0);
    expect(result.netProfit).toBeGreaterThanOrEqual(0);
  });
});

describe("formatBRL", () => {
  it("formatBRL_currencyValue_result", () => {
    expect(formatBRL(1234.56)).toContain("1.234,56");
  });

  it("formatBRL_nonFiniteValue_error", () => {
    expect(() => formatBRL(Number.NaN)).toThrow("deve ser finito");
  });
});
