// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportCsv } from "./ImportCsv";

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

describe("ImportCsv", () => {
  it("freeAccount_cannotOpenImporter", () => {
    render(<ImportCsv plan="free" onImported={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Ver plano" })).toHaveAttribute(
      "href",
      "/app/plano",
    );
    expect(screen.queryByRole("button", { name: "Importar meu CSV" })).not.toBeInTheDocument();
  });

  it("previewWithInvalidRow_requiresExplicitPartialChoice", async () => {
    const onImported = vi.fn().mockResolvedValue(undefined);
    vi.mocked(fetch).mockImplementation(async (path) =>
      String(path).endsWith("/preview")
        ? response({
            previewId: "preview-test",
            rows: [
              { line: 2, sku: "A", name: "Caneta", cost: 10, action: "create", errors: [], newPrice: 15 },
              { line: 3, sku: "A", name: "Repetida", cost: 11, action: "invalid", errors: ["SKU repetido"], newPrice: null },
            ],
            validCount: 1,
            invalidCount: 1,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          })
        : response({ created: 1, updated: 0, skipped: 1, errors: [] }),
    );
    const user = userEvent.setup();
    render(<ImportCsv plan="pro" onImported={onImported} />);
    await user.click(screen.getByRole("button", { name: "Importar meu CSV" }));
    await user.upload(
      screen.getByLabelText("Arquivo CSV"),
      new File(["SKU;PRODUTO;CUSTO\nA;Caneta;10"], "produtos.csv", { type: "text/csv" }),
    );
    await user.type(screen.getByLabelText("Comissão (%)"), "12");
    await user.click(screen.getByRole("button", { name: "Revisar antes de salvar" }));
    const confirm = await screen.findByRole("button", { name: "Confirmar 1 produto(s)" });
    expect(confirm).toBeDisabled();
    expect(screen.getByText("SKU repetido")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Salvar somente as linhas válidas/ }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await screen.findByText(/1 criado\(s\), 0 atualizado\(s\)/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledOnce();
  });
});
