import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateDraft, type SimulationDraft } from "./simulation-draft";
const draft: SimulationDraft = {
  version: 1,
  channelId: "mercado_livre",
  tariffMode: "manual",
  confirmedDropOff: false,
  excludeTax: false,
  input: {
    productCost: 50,
    packaging: 3,
    sellerShipping: 0,
    desiredMarginPercent: 20,
    commissionPercent: 16,
    taxPercent: 6,
    fixedFee: 6,
    mode: "margin_to_price",
  },
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("validateDraft", () => {
  it("validateDraft_extraClientFields_ignoresOwnershipAndTotals", () => {
    const output = validateDraft({
      ...draft,
      userId: "another",
      result: { netProfit: 999999 },
      input: { ...draft.input, evil: true },
    });
    expect(output).toEqual(draft);
    expect(output).not.toHaveProperty("userId");
  });
  it("validateDraft_forgedFixedFee_recomputesOfficialComponent", () => {
    expect(
      validateDraft({
        ...draft,
        tariffMode: "ml_drop_off",
        confirmedDropOff: true,
      }).input.fixedFee,
    ).toBe(0);
  });
  it("validateDraft_excludedTax_setsTaxToZero", () => {
    expect(validateDraft({ ...draft, excludeTax: true }).input.taxPercent).toBe(
      0,
    );
  });
  it.each([
    null,
    {},
    { ...draft, version: 2 },
    { ...draft, channelId: "unknown" },
    { ...draft, tariffMode: "ml_drop_off", channelId: "shopee" },
    { ...draft, input: { ...draft.input, productCost: -1 } },
  ])("validateDraft_invalidPayload_rejects", (value) => {
    expect(() => validateDraft(value)).toThrow();
  });
  it("validateDraft_expiredRule_requiresRecalculation", () => {
    vi.setSystemTime(new Date("2026-09-30"));
    expect(() =>
      validateDraft({
        ...draft,
        tariffMode: "ml_drop_off",
        confirmedDropOff: true,
      }),
    ).toThrow("conferência");
  });
});
