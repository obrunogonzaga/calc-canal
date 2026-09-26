// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SupportClient } from "./SupportClient";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SupportClient", () => {
  it("submit_validMessage_showsProtocol", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ protocol: "protocol-a" }) } as Response);
    const user = userEvent.setup();
    render(<SupportClient />);
    await user.type(screen.getByLabelText("Mensagem"), "Preciso de ajuda para acessar.");
    await user.click(screen.getByRole("button", { name: "Enviar ao suporte" }));
    expect(await screen.findByRole("status")).toHaveTextContent("protocol-a");
  });

  it("submit_deliveryError_keepsMessageAndExplainsFailure", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "Envio indisponível." }) } as Response);
    const user = userEvent.setup();
    render(<SupportClient />);
    await user.type(screen.getByLabelText("Mensagem"), "Preciso de ajuda para acessar.");
    await user.click(screen.getByRole("button", { name: "Enviar ao suporte" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Envio indisponível.");
    expect(screen.getByLabelText("Mensagem")).toHaveValue("Preciso de ajuda para acessar.");
  });
});
