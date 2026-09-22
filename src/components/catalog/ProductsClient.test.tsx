// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductsClient } from "./ProductsClient";

const emptyCatalog = {
  products: [],
  entitlement: {
    plan: "free",
    limit: 5,
    count: 0,
    archivedCount: 0,
    requiresSelection: false,
    selectedEditableCount: 0,
  },
};
function response(data: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => data,
  } as Response;
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProductsClient", () => {
  it("createProduct_failedSave_preservesInputsAndExplainsFailure", async () => {
    vi.mocked(fetch).mockImplementation(async (_path, init) =>
      init?.method === "POST"
        ? response({ error: "Já existe um produto com esse SKU nesta conta." }, 409)
        : response(emptyCatalog),
    );
    const user = userEvent.setup();
    render(<ProductsClient />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    await user.type(screen.getByLabelText("SKU"), "CAMISETA-P");
    await user.type(screen.getByLabelText("Nome do produto"), "Camiseta P");
    await user.type(screen.getByLabelText("Custo do produto (R$)"), "20");
    await user.type(screen.getByLabelText("Comissão (%)"), "12");
    await user.type(screen.getByLabelText("Taxa fixa por unidade (R$)"), "2");
    await user.click(screen.getByRole("button", { name: "Salvar produto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe um produto");
    expect(screen.getByLabelText("SKU")).toHaveValue("CAMISETA-P");
    expect(screen.getByLabelText("Custo do produto (R$)")).toHaveValue("20");
    const [, options] = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    const sent = JSON.parse(String(options?.body));
    expect(sent).not.toHaveProperty("result");
    expect(sent.draft.input.productCost).toBe(20);
  });

  it("changeChannel_clearsMercadoLivreRule", async () => {
    vi.mocked(fetch).mockResolvedValue(response(emptyCatalog));
    const user = userEvent.setup();
    render(<ProductsClient />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    await user.selectOptions(screen.getByLabelText("Custo fixo"), "ml_drop_off");
    expect(screen.getByText(/Somente para Mercado Envios ME2 Drop Off/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Canal"), "shopee");
    expect(screen.queryByText(/Somente para Mercado Envios ME2 Drop Off/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Taxa fixa por unidade (R$)")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
});
