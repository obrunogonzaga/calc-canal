import { describe, expect, it, vi } from "vitest";

const { consumeOneTimeVerificationUrl } = vi.hoisted(() => ({
  consumeOneTimeVerificationUrl: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/server/auth", () => ({
  consumeOneTimeVerificationUrl,
  getAuth: vi.fn(),
  getAuthBaseUrl: () => "https://piloto.useliquido.com.br",
  isAuthEnabled: () => true,
  isVerificationPathname: (pathname: string) =>
    pathname === "/api/auth/verify-email",
  runWithEmailDeliveryBoundary: vi.fn(),
}));

import { GET } from "./[...all]/route";

describe("GET verify-email", () => {
  it("GET_reusedVerificationLink_removesSuccessFlag", async () => {
    const url = new URL(
      "https://piloto.useliquido.com.br/api/auth/verify-email",
    );
    url.searchParams.set("verificationId", "used-record");
    url.searchParams.set("token", "used-token");
    url.searchParams.set("callbackURL", "/entrar?verificado=1");

    const response = await GET(new Request(url));
    const redirect = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(consumeOneTimeVerificationUrl).toHaveBeenCalledWith(
      "used-record",
      "used-token",
    );
    expect(redirect.pathname).toBe("/entrar");
    expect(redirect.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(redirect.searchParams.has("verificado")).toBe(false);
  });
});
