// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calculator } from "./Calculator";
const pdf = vi.hoisted(() => ({ downloadBreakdownPdf: vi.fn() }));
vi.mock("@/lib/pdf", () => pdf);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-22T12:00:00-03:00"));
  pdf.downloadBreakdownPdf.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function example() {
  const user = userEvent.setup();
  render(<Calculator />);
  await user.click(
    screen.getByRole("button", { name: "Usar exemplo fictício" }),
  );
  return user;
}
async function calculate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Calcular preço sugerido" }),
  );
}

describe("Calculator", () => {
  it("submit_emptyRequiredFields_marksErrorsWithoutResult", async () => {
    const user = userEvent.setup();
    render(<Calculator />);
    await calculate(user);
    expect(screen.getByRole("alert")).toHaveTextContent("Revise os campos");
    expect(screen.getByLabelText("Custo do produto (R$)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: /Baixar simulação/ }),
    ).not.toBeInTheDocument();
  });
  it("submit_exampleCalculations_hasNoDailyPaywall", async () => {
    const user = await example();
    for (let i = 0; i < 6; i++) await calculate(user);
    expect(screen.getByText("Simulação pronta")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Seu preço sugerido")).toBeInTheDocument();
  });
  it("edit_costAfterCalculation_invalidatesResultAndExport", async () => {
    const user = await example();
    await calculate(user);
    await user.type(screen.getByLabelText("Custo do produto (R$)"), "1");
    expect(screen.queryByText("Simulação pronta")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Baixar simulação/ }),
    ).not.toBeInTheDocument();
  });
  it("submit_brlGroupedValueAndNegativeInput_validatesFullValue", async () => {
    const user = await example();
    const input = screen.getByLabelText("Custo do produto (R$)");
    await user.clear(input);
    await user.type(input, "1.234,56");
    await calculate(user);
    expect(screen.getByText(/− R\$\s*1\.234,56/)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "-5");
    await calculate(user);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Simulação pronta")).not.toBeInTheDocument();
  });
  it("submit_impossibleMargin_showsRecoverableError", async () => {
    const user = await example();
    const input = screen.getByLabelText("Margem desejada (%)");
    await user.clear(input);
    await user.type(input, "90");
    await calculate(user);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Simulação pronta")).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "20");
    await calculate(user);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("switchMode_lowSalePrice_displaysLossAndInvalidatesPrevious", async () => {
    const user = await example();
    await calculate(user);
    await user.click(screen.getByLabelText("Conferir minha margem"));
    expect(screen.queryByText("Simulação pronta")).not.toBeInTheDocument();
    const input = screen.getByLabelText("Preço de venda (R$)");
    await user.clear(input);
    await user.type(input, "10");
    await user.click(
      screen.getByRole("button", { name: "Calcular contribuição" }),
    );
    expect(screen.getByText(/A venda não cobre/)).toBeInTheDocument();
    expect(screen.getByText("Contribuição por unidade")).toBeInTheDocument();
  });
  it("submit_excludedTax_snapshotsPremiseInPdf", async () => {
    const user = await example();
    await user.click(
      screen.getByRole("checkbox", { name: /Simular sem impostos/ }),
    );
    await calculate(user);
    await user.click(screen.getByRole("button", { name: /Baixar simulação/ }));
    await waitFor(() =>
      expect(pdf.downloadBreakdownPdf).toHaveBeenCalledOnce(),
    );
    expect(pdf.downloadBreakdownPdf.mock.calls[0][0].breakdown.tax).toBe(0);
    expect(pdf.downloadBreakdownPdf.mock.calls[0][0].assumptions).toContain(
      "Impostos não incluídos por escolha do usuário.",
    );
  });
  it("export_pdfFailure_keepsResultAndOffersRetry", async () => {
    const user = await example();
    await calculate(user);
    pdf.downloadBreakdownPdf.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    await user.click(screen.getByRole("button", { name: /Baixar simulação/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível gerar",
      ),
    );
    expect(screen.getByText("Simulação pronta")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Baixar simulação/ }),
    ).toBeEnabled();
  });
  it("submit_verifiedLogistics_requiresConfirmationAndPreservesManualFee", async () => {
    const user = await example();
    await user.selectOptions(
      screen.getByLabelText("Como definir o custo fixo?"),
      "ml_drop_off",
    );
    await calculate(user);
    expect(screen.getByRole("alert")).toHaveTextContent("Confirme");
    await user.click(
      screen.getByRole("checkbox", { name: /Conferi no anúncio/ }),
    );
    await calculate(user);
    await user.click(screen.getByRole("button", { name: /Baixar simulação/ }));
    await waitFor(() =>
      expect(pdf.downloadBreakdownPdf).toHaveBeenCalledOnce(),
    );
    expect(pdf.downloadBreakdownPdf.mock.calls[0][0].breakdown.fixedFee).toBe(
      0,
    );
    expect(
      pdf.downloadBreakdownPdf.mock.calls[0][0].assumptions.join(" "),
    ).toContain("mlb-me2-drop-off-fixed-2026-09-22");
    await user.selectOptions(
      screen.getByLabelText("Como definir o custo fixo?"),
      "manual",
    );
    expect(screen.getByLabelText("Taxa fixa por unidade (R$)")).toHaveValue(
      "6",
    );
    await user.selectOptions(
      screen.getByLabelText("Onde você vende?"),
      "shopee",
    );
    expect(
      screen.queryByLabelText("Como definir o custo fixo?"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Taxa fixa por unidade (R$)")).toHaveValue(
      "6",
    );
  });
  it("submit_expiredRule_requiresManualFallback", async () => {
    const user = await example();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    await user.selectOptions(
      screen.getByLabelText("Como definir o custo fixo?"),
      "ml_drop_off",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Conferi no anúncio/ }),
    );
    await calculate(user);
    expect(screen.getByRole("alert")).toHaveTextContent("conferência");
    expect(screen.queryByText("Simulação pronta")).not.toBeInTheDocument();
  });
});
