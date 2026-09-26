// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchReprice } from "./BatchReprice";

function response(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BatchReprice", () => {
  it("prepareWithoutChange_blocksRequest", async () => {
    const user = userEvent.setup();
    render(<BatchReprice ids={["id-1"]} onCommitted={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Comparar antes e depois" }));
    expect(screen.getByRole("alert")).toHaveTextContent("pelo menos uma mudança");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("previewWithInvalidProduct_requiresPartialChoice", async () => {
    const onCommitted = vi.fn().mockResolvedValue(undefined);
    vi.mocked(fetch).mockImplementation(async (path) =>
      String(path).endsWith("/preview")
        ? response({
            previewId: "preview-1",
            validCount: 1,
            invalidCount: 1,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            rows: [
              { id: "id-1", sku: "A", name: "Produto A", oldCost: 10, currentPrice: 19, newCost: 11, oldPrice: 20, newPrice: 22, oldProfit: 4, newProfit: 4.4, belowTarget: false, errors: [] },
              { id: "id-2", sku: "B", name: "Produto B", oldCost: 10, currentPrice: null, newCost: 10, oldPrice: 20, newPrice: 20, oldProfit: 4, newProfit: 4, belowTarget: false, errors: ["Regra incompatível"] },
            ],
          })
        : response({ updated: 1, skipped: 1, errors: [{ id: "id-2", errors: ["Regra incompatível"] }] }),
    );
    const user = userEvent.setup();
    render(<BatchReprice ids={["id-1", "id-2"]} onCommitted={onCommitted} />);
    await user.type(screen.getByLabelText("Alteração de custo (%)"), "10");
    await user.click(screen.getByRole("button", { name: "Comparar antes e depois" }));
    const confirm = await screen.findByRole("button", { name: "Confirmar 1 produto(s)" });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("cell", { name: /Regra incompatível/ })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /19,00/ })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Salvar só os produtos válidos/ }));
    await user.click(confirm);
    expect(await screen.findByText(/1 atualizado\(s\), 1 ignorado\(s\)/)).toBeInTheDocument();
    expect(onCommitted).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(options?.body)).changes).toEqual({ costAdjustmentPercent: 10 });
  });
});
