import { describe, expect, it } from "vitest";
import { isRuleCurrent, mlDropOffRule, resolveFixedFee } from "./tariffs";
import { calculatePricing } from "./pricing";
const checked = new Date("2026-09-22T12:00:00-03:00");
describe("tariffs", () => {
  it("resolveFixedFee_manualOverride_preservesValue", () => {
    expect(resolveFixedFee("manual", 6.75, false, checked)).toEqual({
      amount: 6.75,
      ruleId: "manual-v1",
    });
  });
  it("resolveFixedFee_unconfirmedLogistics_rejectsPreset", () => {
    expect(() => resolveFixedFee("ml_drop_off", 6, false, checked)).toThrow(
      "Confirme",
    );
  });
  it("resolveFixedFee_staleRule_requiresManual", () => {
    expect(() =>
      resolveFixedFee("ml_drop_off", 0, true, new Date("2026-09-29T03:00:00Z")),
    ).toThrow("conferência");
  });
  it("isRuleCurrent_effectiveAndReviewBoundaries_limitsUse", () => {
    expect(isRuleCurrent(new Date("2026-03-02T02:59:59Z"))).toBe(false);
    expect(isRuleCurrent(new Date("2026-03-02T03:00:00Z"))).toBe(true);
    expect(isRuleCurrent(new Date("2026-09-29T02:59:59Z"))).toBe(true);
    expect(isRuleCurrent(new Date("2026-09-29T03:00:00Z"))).toBe(false);
    expect(isRuleCurrent(new Date("invalid"))).toBe(false);
  });
  it.each([
    8, 12.49, 12.5, 12.51, 28.99, 29, 29.01, 49.99, 50, 50.01, 78.99, 79, 79.01,
    100,
  ])("calculatePricing_dropOffAt%s_usesZeroFixedFee", (salePrice) => {
    // Regression values around legacy thresholds, not a claim that these are current TH values.
    const rule = resolveFixedFee("ml_drop_off", 6, true, checked);
    const result = calculatePricing({
      mode: "price_to_profit",
      productCost: 1,
      packaging: 0,
      sellerShipping: 0,
      desiredMarginPercent: 0,
      commissionPercent: 10,
      taxPercent: 0,
      fixedFee: rule.amount,
      salePrice,
    });
    expect(result.fixedFee).toBe(0);
    expect(result.commission).toBe(Math.round(salePrice * 10) / 100);
    expect(rule.ruleId).toBe(mlDropOffRule.id);
  });
  it("calculatePricing_dropOffMarginMode_verifiesFinalPrice", () => {
    const result = calculatePricing({
      mode: "margin_to_price",
      productCost: 53,
      packaging: 0,
      sellerShipping: 0,
      desiredMarginPercent: 20,
      commissionPercent: 10,
      taxPercent: 0,
      fixedFee: resolveFixedFee("ml_drop_off", 10, true, checked).amount,
    });
    expect(result.fixedFee).toBe(0);
    expect(result.netProfit / result.suggestedPrice).toBeGreaterThanOrEqual(
      0.2,
    );
  });
});
