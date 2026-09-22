// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BillingClient } from "./BillingClient";

function response(data: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => data } as Response;
}
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  window.history.replaceState({}, "", "/app/plano");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BillingClient", () => {
  it("checkoutDisabled_freeAccount_showsPriceWithoutPurchaseAction", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ plan: "free", checkoutEnabled: false }));
    render(<BillingClient />);
    expect(await screen.findByText(/R\$ 29,90 por mês/)).toBeInTheDocument();
    expect(screen.getByText(/ainda está em homologação/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Testar checkout/ })).not.toBeInTheDocument();
  });

  it("successReturn_withoutWebhook_keepsFreePlan", async () => {
    window.history.replaceState({}, "", "/app/plano?retorno=sucesso");
    vi.mocked(fetch).mockResolvedValue(response({ plan: "free", checkoutEnabled: false }));
    render(<BillingClient />);
    expect(await screen.findByText(/Retorno do checkout recebido/)).toBeInTheDocument();
    expect(screen.getByText(/Você está na prévia gratuita/)).toBeInTheDocument();
    expect(screen.queryByText(/Seu catálogo PRO está disponível/)).not.toBeInTheDocument();
  });

  it("startCardCheckout_preparingOrder_doesNotTreatItAsPaid", async () => {
    vi.mocked(fetch).mockImplementation(async (_input, init) =>
      init?.method === "POST"
        ? response({
            plan: "free",
            checkoutEnabled: true,
            order: { id: "order-1", status: "creating" },
          }, 202)
        : response({ plan: "free", checkoutEnabled: true }),
    );
    const user = userEvent.setup();
    render(<BillingClient />);
    await user.click(await screen.findByRole("button", { name: "Testar checkout no Asaas" }));
    expect(await screen.findByText(/Pedido de teste em preparação/)).toBeInTheDocument();
    expect(screen.queryByText(/Seu catálogo PRO está disponível/)).not.toBeInTheDocument();
  });

  it("failedOrder_doesNotOfferOldCheckoutLink", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      plan: "free",
      checkoutEnabled: true,
      order: { id: "order-1", status: "failed", link: "https://sandbox.asaas.com/checkoutSession/show/old" },
    }));
    render(<BillingClient />);
    expect(await screen.findByRole("button", { name: "Testar checkout no Asaas" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Continuar no Asaas Sandbox" })).not.toBeInTheDocument();
  });
});
