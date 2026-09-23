import { describe, expect, it, vi } from "vitest";

import {
  ASAAS_SANDBOX_API_BASE_URL,
  createAsaasSandboxSubscriptionClient,
} from "./asaas-subscription-client";

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

function payment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pay_123",
    subscription: "sub_123",
    checkoutSession: "checkout-123",
    status: "CONFIRMED",
    value: 29.9,
    billingType: "CREDIT_CARD",
    dueDate: "2026-10-01",
    ...overrides,
  };
}

function list(data: unknown[], hasMore = false): Response {
  return response({ object: "list", hasMore, data });
}

function requestUrl(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(fetchMock.mock.calls[call]?.[0] as string);
}

describe("createAsaasSandboxSubscriptionClient", () => {
  it("isSubscriptionDeleted_checksExactIdInDeletedOnlyPages", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(list([{ id: "sub_other", deleted: true }], true))
      .mockResolvedValueOnce(list([{ id: "sub_123", deleted: true }]));
    const client = createAsaasSandboxSubscriptionClient({
      env: sandboxEnv(), fetch: fetchMock, pageSize: 1, maxPages: 2,
    });
    await expect(client.isSubscriptionDeleted("sub_123")).resolves.toBe(true);
    expect(requestUrl(fetchMock, 0).searchParams.get("deletedOnly")).toBe("true");
    expect(requestUrl(fetchMock, 1).searchParams.get("offset")).toBe("1");
  });
  it("createAsaasSandboxSubscriptionClient_requiresSandboxOnlyConfiguration", () => {
    expect(() =>
      createAsaasSandboxSubscriptionClient({ env: { ASAAS_ENV: "production" } }),
    ).toThrow("ASAAS_ENV");
    expect(() =>
      createAsaasSandboxSubscriptionClient({ env: { ASAAS_ENV: "sandbox" } }),
    ).toThrow("ASAAS_SANDBOX_API_KEY");
    expect(() =>
      createAsaasSandboxSubscriptionClient({
        env: {
          ASAAS_ENV: "sandbox",
          ASAAS_API_KEY: "$aact_hmlg_must-not-fallback",
        },
      }),
    ).toThrow("ASAAS_SANDBOX_API_KEY");
    expect(() =>
      createAsaasSandboxSubscriptionClient({
        env: {
          ASAAS_ENV: "sandbox",
          ASAAS_SANDBOX_API_KEY: "$aact_prod_never-use-this",
        },
      }),
    ).toThrow("chave de Sandbox");
  });

  it("findSubscriptionByCheckoutSession_remoteFalseNegative_fallsBackToBoundedLocalScan", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce(
        list([
          payment({ checkoutSession: "another-checkout", subscription: "sub_other" }),
          payment(),
        ]),
      );
    const client = createAsaasSandboxSubscriptionClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    await expect(client.findSubscriptionByCheckoutSession("checkout-123")).resolves.toEqual({
      subscriptionId: "sub_123",
      paymentId: "pay_123",
      checkoutSession: "checkout-123",
      paymentStatus: "CONFIRMED",
      value: 29.9,
      billingType: "CREDIT_CARD",
      dueDate: "2026-10-01",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestUrl(fetchMock, 0).origin + requestUrl(fetchMock, 0).pathname).toBe(
      `${ASAAS_SANDBOX_API_BASE_URL}/payments`,
    );
    expect(requestUrl(fetchMock, 0).searchParams.get("checkoutSession")).toBe(
      "checkout-123",
    );
    expect(requestUrl(fetchMock, 1).searchParams.has("checkoutSession")).toBe(false);
  });

  it("findCheckoutPaymentBySession_pixWithoutSubscription_findsExactCheckout", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce(list([payment({ subscription: null, billingType: "PIX", status: "RECEIVED" })]));
    const client = createAsaasSandboxSubscriptionClient({ env: sandboxEnv(), fetch: fetchMock });
    await expect(client.findCheckoutPaymentBySession("checkout-123")).resolves.toMatchObject({
      paymentId: "pay_123", checkoutSession: "checkout-123", billingType: "PIX",
      paymentStatus: "RECEIVED", value: 29.9,
    });
  });

  it("findInitialPaymentBySubscription_falseNegative_fallsBackToExactSubscription", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce(list([
        payment({ subscription: "sub_other" }),
        payment(),
        payment({ id: "pay_next", checkoutSession: null }),
      ]));
    const client = createAsaasSandboxSubscriptionClient({ env: sandboxEnv(), fetch: fetchMock });
    await expect(client.findInitialPaymentBySubscription("sub_123")).resolves.toMatchObject({
      subscriptionId: "sub_123", paymentId: "pay_123", checkoutSession: "checkout-123",
    });
    expect(requestUrl(fetchMock, 0).searchParams.get("subscription")).toBe("sub_123");
    expect(requestUrl(fetchMock, 1).searchParams.has("subscription")).toBe(false);
  });

  it("findSubscriptionByCheckoutSession_paginatedFallback_filtersLocally", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce(list([payment({ checkoutSession: "wrong-checkout" })], true))
      .mockResolvedValueOnce(list([payment()]));
    const client = createAsaasSandboxSubscriptionClient({
      env: sandboxEnv(),
      fetch: fetchMock,
      pageSize: 1,
      maxPages: 2,
    });

    const match = await client.findSubscriptionByCheckoutSession("checkout-123");

    expect(match?.subscriptionId).toBe("sub_123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestUrl(fetchMock, 0).searchParams).toMatchObject({});
    expect(requestUrl(fetchMock, 0).searchParams.get("offset")).toBe("0");
    expect(requestUrl(fetchMock, 1).searchParams.get("offset")).toBe("0");
    expect(requestUrl(fetchMock, 2).searchParams.get("offset")).toBe("1");
    expect(requestUrl(fetchMock, 2).searchParams.get("limit")).toBe("1");
  });

  it("findSubscriptionByCheckoutSession_duplicatePayments_failsClosed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      list([
        payment(),
        payment({ id: "pay_456", subscription: "sub_456" }),
      ]),
    );
    const client = createAsaasSandboxSubscriptionClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    await expect(
      client.findSubscriptionByCheckoutSession("checkout-123"),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_MATCH" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("findSubscriptionByCheckoutSession_timeout_returnsTypedSafeError", async () => {
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
    const client = createAsaasSandboxSubscriptionClient({
      env: sandboxEnv(),
      fetch: fetchMock,
      timeoutMs: 5,
    });

    await expect(
      client.findSubscriptionByCheckoutSession("checkout-123"),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("getSubscription_httpError_doesNotExposeApiKeyOrResponseBody", async () => {
    const apiKey = "$aact_hmlg_secret-must-not-leak";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ errors: [{ description: apiKey }] }, 401));
    const client = createAsaasSandboxSubscriptionClient({
      env: { ASAAS_ENV: "sandbox", ASAAS_SANDBOX_API_KEY: apiKey },
      fetch: fetchMock,
    });

    let error: unknown;
    try {
      await client.getSubscription("sub_123");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(apiKey);
    expect((error as Error).message).not.toContain("secret");
    expect(error).toMatchObject({ code: "HTTP_ERROR", status: 401 });
  });

  it("getSubscription_returnsOnlyValidatedSubscriptionFields", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: "sub_123",
        value: 29.9,
        cycle: "MONTHLY",
        billingType: "CREDIT_CARD",
        status: "ACTIVE",
        nextDueDate: "2026-11-01",
        deleted: false,
        customer: "cus_ignore",
      }),
    );
    const client = createAsaasSandboxSubscriptionClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    await expect(client.getSubscription("sub_123")).resolves.toEqual({
      id: "sub_123",
      value: 29.9,
      cycle: "MONTHLY",
      billingType: "CREDIT_CARD",
      status: "ACTIVE",
      nextDueDate: "2026-11-01",
      deleted: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${ASAAS_SANDBOX_API_BASE_URL}/subscriptions/sub_123`,
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("GET");
  });

  it("cancelSubscription_invalidIdDoesNotCallAsaas_andValidIdDeletesOnce", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ id: "sub_123" }));
    const client = createAsaasSandboxSubscriptionClient({
      env: sandboxEnv(),
      fetch: fetchMock,
    });

    await expect(client.cancelSubscription("not-a-subscription")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(client.cancelSubscription("sub_123")).resolves.toEqual({
      id: "sub_123",
      cancelled: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${ASAAS_SANDBOX_API_BASE_URL}/subscriptions/sub_123`,
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("DELETE");
    expect(request.body).toBeUndefined();
  });
});
