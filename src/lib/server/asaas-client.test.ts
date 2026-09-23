import { describe, expect, it, vi } from "vitest";

import { PRO_MONTHLY_AMOUNT_BRL } from "@/lib/billing-plan";
import { ASAAS_SANDBOX_API_BASE_URL, createAsaasSandboxClient } from "./asaas-client";

const callbacks = {
  successUrl: "https://app.example.com/checkout/sucesso",
  cancelUrl: "https://app.example.com/checkout/cancelado",
  expiredUrl: "https://app.example.com/checkout/expirado",
};

function sandboxEnv(): Record<string, string> {
  return {
    ASAAS_ENV: "sandbox",
    ASAAS_SANDBOX_API_KEY: "$aact_hmlg_test-only-key",
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createAsaasSandboxClient", () => {
  it("createAsaasSandboxClient_missingOrProductionConfig_failsClosed", () => {
    expect(() =>
      createAsaasSandboxClient({ env: { ASAAS_ENV: "production" } }),
    ).toThrow("ASAAS_ENV");
    expect(() =>
      createAsaasSandboxClient({ env: { ASAAS_ENV: "sandbox" } }),
    ).toThrow("ASAAS_SANDBOX_API_KEY");
    expect(() =>
      createAsaasSandboxClient({
        env: {
          ASAAS_ENV: "sandbox",
          ASAAS_API_KEY: "$aact_hmlg_should-not-fallback",
        },
      }),
    ).toThrow("ASAAS_SANDBOX_API_KEY");
    expect(() =>
      createAsaasSandboxClient({
        env: {
          ASAAS_ENV: "sandbox",
          ASAAS_SANDBOX_API_KEY: "$aact_prod_never-use-this",
        },
      }),
    ).toThrow("chave de Sandbox");
  });

  it("createRecurringCardCheckout_sandboxPayload_returnsIdAndCanonicalLink", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({
          id: "checkout-card-123",
          link: "https://sandbox.asaas.com/checkoutSession/show/checkout-card-123",
          status: "ACTIVE",
          externalReference: "account-123",
        }),
      );
    const client = createAsaasSandboxClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    const result = await client.createRecurringCardCheckout({
      externalReference: "account-123",
      callbacks,
      nextDueDate: "2026-10-01",
    });

    expect(result).toEqual({
      id: "checkout-card-123",
      link: "https://sandbox.asaas.com/checkoutSession/show/checkout-card-123",
      status: "ACTIVE",
      externalReference: "account-123",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ASAAS_SANDBOX_API_BASE_URL}/checkouts`);
    expect(request.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Liquido/0.1",
      access_token: "$aact_hmlg_test-only-key",
    });
    expect(String(request.body)).not.toContain("aact_hmlg");
    expect(JSON.parse(String(request.body))).toEqual({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 60,
      externalReference: "account-123",
      callback: callbacks,
      items: [
        {
          name: "Líquido PRO",
          quantity: 1,
          value: PRO_MONTHLY_AMOUNT_BRL,
        },
      ],
      subscription: { cycle: "MONTHLY", nextDueDate: "2026-10-01" },
    });
  });

  it("createPixCheckout_sandboxPayload_returnsResultWithoutGrantingAccess", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({
          id: "checkout-pix-123",
          status: "ACTIVE",
        }),
      );
    const client = createAsaasSandboxClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    const result = await client.createPixCheckout({
      externalReference: "account-123-pix-2026-10",
      callbacks,
      minutesToExpire: 60,
    });

    expect(result).toEqual({
      id: "checkout-pix-123",
      link: "https://sandbox.asaas.com/checkoutSession/show/checkout-pix-123",
      status: "ACTIVE",
      externalReference: "account-123-pix-2026-10",
    });
    expect(result).not.toHaveProperty("pro");
    expect(result).not.toHaveProperty("access");
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      billingTypes: ["PIX"],
      chargeTypes: ["DETACHED"],
      minutesToExpire: 60,
      externalReference: "account-123-pix-2026-10",
      callback: callbacks,
      items: [
        {
          name: "Líquido PRO — 1 mês",
          quantity: 1,
          value: PRO_MONTHLY_AMOUNT_BRL,
        },
      ],
    });
  });

  it("createPixCheckout_invalidExpiration_doesNotCallAsaas", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createAsaasSandboxClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    await expect(
      client.createPixCheckout({
        externalReference: "account-123",
        callbacks,
        minutesToExpire: 9,
      }),
    ).rejects.toThrow("minutesToExpire");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createRecurringCardCheckout_invalidFirstDate_doesNotCallAsaas", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createAsaasSandboxClient({ env: sandboxEnv(), fetch: fetchMock });
    await expect(
      client.createRecurringCardCheckout({
        externalReference: "order-1",
        callbacks,
        nextDueDate: "2026-02-31",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createCheckout_httpError_doesNotExposeApiKey", async () => {
    const apiKey = "$aact_hmlg_secret-must-not-leak";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ error: apiKey }, 401));
    const client = createAsaasSandboxClient({
      env: { ASAAS_ENV: "sandbox", ASAAS_SANDBOX_API_KEY: apiKey },
      fetch: fetchMock,
    });

    let error: unknown;
    try {
      await client.createPixCheckout({
        externalReference: "account-123",
        callbacks,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(apiKey);
    expect((error as Error).message).not.toContain("secret");
    expect(error).toMatchObject({ code: "HTTP_ERROR", status: 401 });
  });

  it("createCheckout_timeout_returnsSafeError", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const client = createAsaasSandboxClient({
      env: sandboxEnv(),
      fetch: fetchMock,
      timeoutMs: 5,
    });

    await expect(
      client.createPixCheckout({ externalReference: "account-123", callbacks }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("createCheckout_invalidResponse_requiresId", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ link: "https://sandbox.asaas.com/checkoutSession/show/missing" }),
    );
    const client = createAsaasSandboxClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    await expect(
      client.createPixCheckout({ externalReference: "account-123", callbacks }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("createCheckout_idOnlyResponse_buildsSandboxLink", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ id: "checkout-id-only" }),
    );
    const client = createAsaasSandboxClient({ env: sandboxEnv(), fetch: fetchMock });
    await expect(
      client.createPixCheckout({ externalReference: "order-1", callbacks }),
    ).resolves.toMatchObject({
      id: "checkout-id-only",
      status: "CREATED",
      link: "https://sandbox.asaas.com/checkoutSession/show/checkout-id-only",
    });
  });

  it("createCheckout_externalLink_rejectsUnexpectedHost", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ id: "checkout-123", link: "https://example.com/checkout-123" }),
    );
    const client = createAsaasSandboxClient({ env: sandboxEnv(), fetch: fetchMock });
    await expect(
      client.createPixCheckout({ externalReference: "order-1", callbacks }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("createCheckout_responseReferenceMismatch_failsClosed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: "checkout-mismatch",
        status: "ACTIVE",
        externalReference: "another-account",
      }),
    );
    const client = createAsaasSandboxClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    await expect(
      client.createPixCheckout({ externalReference: "account-123", callbacks }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
