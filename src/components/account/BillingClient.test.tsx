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
    expect(screen.queryByRole("button", { name: /Testar cartão/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Testar Pix/ })).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Testar cartão no Asaas" }));
    expect(await screen.findByText(/Pedido cartão de teste em preparação/)).toBeInTheDocument();
    expect(screen.queryByText(/Seu catálogo PRO está disponível/)).not.toBeInTheDocument();
  });

  it("failedOrder_doesNotOfferOldCheckoutLink", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      plan: "free",
      checkoutEnabled: true,
      order: { id: "order-1", status: "failed", link: "https://sandbox.asaas.com/checkoutSession/show/old" },
    }));
    render(<BillingClient />);
    expect(await screen.findByRole("button", { name: "Testar cartão no Asaas" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Continuar no Asaas Sandbox" })).not.toBeInTheDocument();
  });

  it("startPixCheckout_sendsPixAndKeepsManualRenewalVisible", async () => {
    vi.mocked(fetch).mockImplementation(async (_input, init) =>
      init?.method === "POST"
        ? response({
            plan: "free",
            checkoutEnabled: true,
            order: { id: "order-pix", method: "pix", status: "creating" },
          }, 202)
        : response({ plan: "free", checkoutEnabled: true }),
    );
    const user = userEvent.setup();
    render(<BillingClient />);
    await user.click(await screen.findByRole("button", { name: "Testar Pix por um mês" }));
    expect(await screen.findByText(/Pedido Pix de teste em preparação/)).toBeInTheDocument();
    expect(screen.getByText(/renovação manual/)).toBeInTheDocument();
    const [, init] = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(JSON.parse(String(init?.body))).toEqual({ method: "pix" });
  });

  it("cancelSubscription_requiresConfirmationAndKeepsPaidAccessVisible", async () => {
    const active = {
      plan: "pro", checkoutEnabled: false, paidUntil: "2026-10-22T23:59:59.000Z",
      subscription: { linked: true, cancellationState: "not_requested" },
    };
    vi.mocked(fetch).mockImplementation(async (_input, init) => init?.method === "POST"
      ? response({ ...active, subscription: { linked: true, cancellationState: "confirmed" } })
      : response(active));
    vi.stubGlobal("confirm", vi.fn(() => true));
    const user = userEvent.setup();
    render(<BillingClient />);
    await user.click(await screen.findByRole("button", { name: "Cancelar próximas renovações" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Renovação cancelada/)).toBeInTheDocument();
    expect(screen.getByText(/Seu catálogo PRO está disponível/)).toBeInTheDocument();
    const [, init] = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(JSON.parse(String(init?.body))).toEqual({ action: "cancel" });
  });

  it("recoverCheckout_pendingCardOffersManualPaymentVerification", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      plan: "free", checkoutEnabled: false,
      order: { id: "order-pending", method: "card", status: "checkout_created" },
    }));
    const user = userEvent.setup();
    render(<BillingClient />);
    await user.click(await screen.findByRole("button", { name: "Verificar pagamento no Asaas" }));
    const [, init] = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(JSON.parse(String(init?.body))).toEqual({ action: "recover_checkout" });
  });

  it("overdueRenewal_showsRegularizationAndKeepsPaidPeriod", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      plan: "pro", checkoutEnabled: false, paidUntil: "2026-10-22T23:59:59.000Z",
      renewalIssue: { dueDate: "2026-10-22", invoiceUrl: "https://sandbox.asaas.com/i/test" },
    }));
    render(<BillingClient />);
    expect(await screen.findByText(/A renovação de/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Regularizar na fatura do Asaas" })).toHaveAttribute(
      "href", "https://sandbox.asaas.com/i/test",
    );
    expect(screen.getByText(/Seu catálogo PRO está disponível/)).toBeInTheDocument();
  });
});
