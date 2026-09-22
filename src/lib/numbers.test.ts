import { describe, expect, it } from "vitest";

import { parseBRNumber } from "./numbers";

describe("parseBRNumber", () => {
  it("parseBRNumber_brFormats_result", () => {
    expect(parseBRNumber("1.234,56")).toBe(1234.56);
    expect(parseBRNumber("1234,56")).toBe(1234.56);
    expect(parseBRNumber("1234")).toBe(1234);
  });

  it("parseBRNumber_dotDecimal_result", () => {
    expect(parseBRNumber("1234.56")).toBe(1234.56);
    expect(parseBRNumber("12.5")).toBe(12.5);
  });

  it("parseBRNumber_groupedInteger_result", () => {
    expect(parseBRNumber("1.234.567")).toBe(1234567);
  });

  it("parseBRNumber_partialAndAmbiguousValues_error", () => {
    for (const value of ["", "  ", "1,", "1.", ".", "1.234", "1,234"]) {
      expect(() => parseBRNumber(value, "Preço")).toThrow("Preço");
    }
  });

  it("parseBRNumber_negativeAndNonFiniteValues_error", () => {
    for (const value of ["-1", "Infinity", "NaN", "1e3"]) {
      expect(() => parseBRNumber(value, "Custo")).toThrow("Custo");
    }
  });
});
