// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftBridge } from "./DraftBridge";
import { DRAFT_KEY } from "@/lib/simulation-draft";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const draft = {
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
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
describe("DraftBridge", () => {
  it("loadDraft_afterAccountEntry_restoresPendingSimulation", async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    render(<DraftBridge />);
    expect(await screen.findByText(/101,73/)).toBeInTheDocument();
  });
  it("saveDraft_success_removesLocalCopy", async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ simulation: { id: "saved" } }),
    } as Response);
    const user = userEvent.setup();
    render(<DraftBridge />);
    await user.click(
      await screen.findByRole("button", { name: "Salvar na minha conta" }),
    );
    await waitFor(() => expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent("salva");
  });
  it("saveDraft_sessionExpired_preservesPendingWork", async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Entre novamente para continuar." }),
    } as Response);
    const user = userEvent.setup();
    render(<DraftBridge />);
    await user.click(
      await screen.findByRole("button", { name: "Salvar na minha conta" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Entre novamente",
    );
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });
  it("loadDraft_corruptPayload_offersRecoveryWithoutCrashing", async () => {
    sessionStorage.setItem(DRAFT_KEY, "invalid");
    render(<DraftBridge />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "precisa ser revisado",
    );
  });
  it("discardDraft_existingDraft_clearsOnlyPendingKey", async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    sessionStorage.setItem("unrelated", "keep");
    const user = userEvent.setup();
    render(<DraftBridge />);
    await user.click(
      await screen.findByRole("button", {
        name: "Descartar rascunho desta aba",
      }),
    );
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });
});
