// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountDataClient } from "./AccountDataClient";

function response(data: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => data } as Response;
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AccountDataClient", () => {
  it("loadRequest_pending_showsAccessibleLoading", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}));
    render(<AccountDataClient />);
    expect(screen.getByRole("status")).toHaveTextContent("Consultando solicitação");
  });

  it("requestDeletion_withoutTypedConfirmation_keepsActionDisabled", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ request: null }));
    const user = userEvent.setup();
    render(<AccountDataClient />);
    const button = await screen.findByRole("button", { name: "Solicitar exclusão" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Digite EXCLUIR para confirmar o pedido"), "EXCLUI");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Digite EXCLUIR para confirmar o pedido"), "R");
    expect(button).toBeEnabled();
  });

  it("requestDeletion_activeRenewal_showsPlanErrorWithoutProtocol", async () => {
    vi.mocked(fetch).mockImplementation(async (_path, init) => init?.method === "POST"
      ? response({ error: "Cancele a renovação do cartão em Plano antes de pedir a exclusão." }, 409)
      : response({ request: null }));
    const user = userEvent.setup();
    render(<AccountDataClient />);
    await user.type(await screen.findByLabelText("Digite EXCLUIR para confirmar o pedido"), "EXCLUIR");
    await user.click(screen.getByRole("button", { name: "Solicitar exclusão" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cancele a renovação");
    expect(screen.queryByText(/Protocolo:/)).not.toBeInTheDocument();
  });
});
