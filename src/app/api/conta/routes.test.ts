import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  exportData: vi.fn(),
  getDeletion: vi.fn(),
  requestDeletion: vi.fn(),
  sendSupport: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireVerifiedSession: mocks.session }));
vi.mock("@/lib/server/account-data", () => ({
  AccountDataError: class AccountDataError extends Error {},
  exportAccountData: mocks.exportData,
  getDeletionRequest: mocks.getDeletion,
  requestAccountDeletion: mocks.requestDeletion,
}));
vi.mock("@/lib/server/mailer", () => ({ sendSupportRequestEmail: mocks.sendSupport }));

import { GET as exportGet } from "./dados/route";
import { GET as deletionGet, POST as deletionPost } from "./exclusao/route";
import { POST as supportPost } from "./suporte/route";

function request(path: string, method = "GET", body?: unknown, origin = "http://localhost:3101") {
  return new NextRequest(`http://localhost:3101${path}`, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("account data routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_ENABLED = "true";
    process.env.BETTER_AUTH_URL = "http://localhost:3101";
    mocks.session.mockResolvedValue({ user: { id: "owner-a", email: "owner@example.test", emailVerified: true } });
    mocks.exportData.mockResolvedValue({ account: { id: "owner-a" } });
    mocks.getDeletion.mockResolvedValue(null);
    mocks.requestDeletion.mockResolvedValue({ id: "protocol-a", status: "pending_review" });
    mocks.sendSupport.mockResolvedValue(undefined);
  });

  it("exportGet_withoutVerifiedSession_deniesAccess", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await exportGet(request("/api/conta/dados"));
    expect(response.status).toBe(401);
    expect(mocks.exportData).not.toHaveBeenCalled();
  });

  it("exportGet_verifiedFreeAccount_exportsOnlySessionOwner", async () => {
    const response = await exportGet(request("/api/conta/dados"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.exportData).toHaveBeenCalledWith("owner-a");
  });

  it("deletionPost_wrongOrigin_rejectsBeforeMutation", async () => {
    const response = await deletionPost(request("/api/conta/exclusao", "POST", { confirmation: "EXCLUIR" }, "https://other.test"));
    expect(response.status).toBe(403);
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it("deletionPost_withoutConfirmation_rejectsBeforeMutation", async () => {
    const response = await deletionPost(request("/api/conta/exclusao", "POST", { confirmation: "sim" }));
    expect(response.status).toBe(422);
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it("deletionPost_withoutSession_rejectsBeforeMutation", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await deletionPost(request("/api/conta/exclusao", "POST", { confirmation: "EXCLUIR" }));
    expect(response.status).toBe(401);
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it("deletionPost_confirmed_usesSessionOwner", async () => {
    const response = await deletionPost(request("/api/conta/exclusao", "POST", { confirmation: "EXCLUIR", userId: "other" }));
    expect(response.status).toBe(202);
    expect(mocks.requestDeletion).toHaveBeenCalledWith("owner-a");
    expect((await response.json()).request.id).toBe("protocol-a");
  });

  it("deletionGet_otherAccountParameter_usesSessionOwner", async () => {
    await deletionGet(request("/api/conta/exclusao?userId=other"));
    expect(mocks.getDeletion).toHaveBeenCalledWith("owner-a");
  });

  it("supportPost_invalidMessage_doesNotSend", async () => {
    const response = await supportPost(request("/api/conta/suporte", "POST", { category: "acesso", message: "short" }));
    expect(response.status).toBe(422);
    expect(mocks.sendSupport).not.toHaveBeenCalled();
  });

  it("supportPost_withoutSession_doesNotSend", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await supportPost(request("/api/conta/suporte", "POST", { category: "acesso", message: "Preciso recuperar o acesso." }));
    expect(response.status).toBe(401);
    expect(mocks.sendSupport).not.toHaveBeenCalled();
  });

  it("supportPost_validMessage_returnsProtocolAfterDelivery", async () => {
    const response = await supportPost(request("/api/conta/suporte", "POST", { category: "acesso", message: "Preciso recuperar o acesso." }));
    expect(response.status).toBe(201);
    expect(mocks.sendSupport).toHaveBeenCalledWith(expect.objectContaining({ fromEmail: "owner@example.test" }));
    expect((await response.json()).protocol).toMatch(/[0-9a-f-]{36}/);
  });
});
