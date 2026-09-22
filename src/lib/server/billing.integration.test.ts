import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { config } from "dotenv";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

config({ path: ".env.local", quiet: true });

const isolated = vi.hoisted(() => ({
  pool: null as Pool | null,
  checkout: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: () => {
    if (!isolated.pool) {
      throw new Error("Test database missing");
    }

    return isolated.pool;
  },
}));

vi.mock("./asaas-client", () => ({
  PRECO_PRONTO_PRO_VALUE: 29.9,
  AsaasClientError: class AsaasClientError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  createAsaasSandboxClient: () => ({
    createRecurringCardCheckout: isolated.checkout,
  }),
}));

import {
  addOneCalendarMonth,
  createCardCheckout,
  getBillingStatus,
  processAsaasCheckoutWebhook,
  saoPauloToday,
  verifyAsaasWebhookToken,
} from "./billing";

import { POST as webhookPost } from "@/app/api/billing/webhook/route";

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const createdUsers = new Set<string>();
const sandboxAccountId = "sandbox-account-123";
const webhookToken = "sandbox-webhook-token-which-is-at-least-32-chars";
const testRunId = randomUUID();
const billingEnvironmentKeys = [
  "BILLING_SANDBOX_ENABLED",
  "APP_ENV",
  "ASAAS_ENV",
  "ASAAS_SANDBOX_API_KEY",
  "ASAAS_SANDBOX_ACCOUNT_ID",
  "ASAAS_SANDBOX_WEBHOOK_TOKEN",
  "BETTER_AUTH_URL",
] as const;
const originalBillingEnvironment = Object.fromEntries(
  billingEnvironmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof billingEnvironmentKeys)[number], string | undefined>;

function eventId(name: string): string {
  return `${name}-${testRunId}`;
}

function testDatabaseUrl(): URL {
  const rawUrl = process.env.TEST_DATABASE_URL;

  if (!rawUrl) {
    throw new Error("Test database missing");
  }

  const url = new URL(rawUrl);
  const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(
    url.hostname.replace(/^\[|\]$/g, ""),
  );

  if (!isLoopback || url.pathname !== "/precopronto_integration") {
    throw new Error("Use the dedicated loopback integration database.");
  }

  return url;
}

async function createActor(prefix: string): Promise<string> {
  const id = randomUUID();
  createdUsers.add(id);
  await isolated.pool!.query(
    `
      INSERT INTO "user" (
        id, name, email, "emailVerified", "createdAt", "updatedAt",
        terms_accepted, terms_version, privacy_version, marketing_consent
      ) VALUES ($1, 'Teste', $2, TRUE, NOW(), NOW(), TRUE, '2026-09-22', '2026-09-22', FALSE)
    `,
    [id, `${prefix}-${id}@precopronto.test`],
  );

  return id;
}

function checkoutPayload(
  order: { id: string; checkoutId: string },
  options: {
    accountId?: string;
    eventId?: string;
    event?: "CHECKOUT_CREATED" | "CHECKOUT_CANCELED" | "CHECKOUT_EXPIRED" | "CHECKOUT_PAID";
    billingTypes?: string[];
    chargeTypes?: string[];
    itemValue?: number;
    externalReference?: string;
  } = {},
) {
  return {
    id: options.eventId ?? randomUUID(),
    event: options.event ?? "CHECKOUT_PAID",
    account: { id: options.accountId ?? sandboxAccountId },
    checkout: {
      id: order.checkoutId,
      externalReference:
        options.externalReference ?? `billing-order:${order.id}`,
      status: options.event === "CHECKOUT_PAID" ? "PAID" : "ACTIVE",
      billingTypes: options.billingTypes ?? ["CREDIT_CARD"],
      chargeTypes: options.chargeTypes ?? ["RECURRENT"],
      items: [
        {
          name: "PreçoPronto PRO",
          quantity: 1,
          value: options.itemValue ?? 29.9,
        },
      ],
      subscription: { id: "sub_test_123" },
    },
  };
}

async function orderRow(orderId: string) {
  const result = await isolated.pool!.query<{
    id: string;
    checkout_id: string | null;
    status: string;
    external_reference: string;
  }>(
    "SELECT id, checkout_id, status, external_reference FROM billing_order WHERE id = $1",
    [orderId],
  );

  return result.rows[0];
}

suite("billing integration", () => {
  beforeAll(async () => {
    process.env.BILLING_SANDBOX_ENABLED = "true";
    process.env.APP_ENV = "local";
    process.env.ASAAS_ENV = "sandbox";
    process.env.ASAAS_SANDBOX_API_KEY = "$aact_hmlg_test-only-key";
    process.env.ASAAS_SANDBOX_ACCOUNT_ID = sandboxAccountId;
    process.env.ASAAS_SANDBOX_WEBHOOK_TOKEN = webhookToken;
    process.env.BETTER_AUTH_URL = "http://localhost:3101";

    const url = testDatabaseUrl();
    isolated.pool = new Pool({ connectionString: url.toString() });
    const [productsSql, billingSql] = await Promise.all([
      readFile(new URL("../../../migrations/0002_products.sql", import.meta.url), "utf8"),
      readFile(new URL("../../../migrations/0005_billing.sql", import.meta.url), "utf8"),
    ]);

    await isolated.pool.query(productsSql);
    await isolated.pool.query(billingSql);
  });

  beforeEach(() => {
    isolated.checkout.mockReset();
    isolated.checkout.mockImplementation(async (input: { externalReference: string }) => ({
      id: `checkout-${randomUUID()}`,
      link: "https://sandbox.asaas.com/checkoutSession/show/test",
      status: "ACTIVE",
      externalReference: input.externalReference,
    }));
  });

  afterAll(async () => {
    if (isolated.pool) {
      await isolated.pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
        [...createdUsers],
      ]);
      await isolated.pool.end();
      isolated.pool = null;
    }

    for (const key of billingEnvironmentKeys) {
      const value = originalBillingEnvironment[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("createCardCheckout_reusesOpenOrderAndUsesSaoPauloToday", async () => {
    const actor = await createActor("billing-click");
    const first = await createCardCheckout(actor);
    const second = await createCardCheckout(actor);
    const input = isolated.checkout.mock.calls[0]?.[0] as {
      callbacks: Record<string, string>;
      nextDueDate: string;
    };

    expect(isolated.checkout).toHaveBeenCalledOnce();
    expect(second.order.id).toBe(first.order.id);
    expect(first.order.link).toContain("sandbox.asaas.com");
    expect(input.nextDueDate).toBe(saoPauloToday());
    expect(input.callbacks).toEqual({
      successUrl: "http://localhost:3101/app/plano?retorno=sucesso",
      cancelUrl: "http://localhost:3101/app/plano?retorno=cancelado",
      expiredUrl: "http://localhost:3101/app/plano?retorno=expirado",
    });
  });

  it("createCardCheckout_ambiguousFailureKeepsCreatingWithoutSecondCheckout", async () => {
    const actor = await createActor("billing-ambiguous");
    isolated.checkout.mockRejectedValueOnce(new Error("network uncertain"));

    const first = await createCardCheckout(actor);
    const retry = await createCardCheckout(actor);

    expect(first).toMatchObject({ ambiguous: true, order: { status: "creating" } });
    expect(retry).toMatchObject({ ambiguous: true, order: { id: first.order.id } });
    expect(isolated.checkout).toHaveBeenCalledOnce();
  });

  it("createCardCheckout_expiredOpenCheckoutRequiresReconciliationInsteadOfRetry", async () => {
    const actor = await createActor("billing-expired-open");
    const checkout = await createCardCheckout(actor);
    await isolated.pool!.query(
      "UPDATE billing_order SET checkout_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
      [checkout.order.id],
    );

    const retry = await createCardCheckout(actor);

    expect(retry).toMatchObject({
      ambiguous: true,
      order: { id: checkout.order.id, status: "checkout_created" },
    });
    expect(isolated.checkout).toHaveBeenCalledOnce();
  });

  it("processAsaasCheckoutWebhook_paidGrantsOnceAndDoesNotRegress", async () => {
    const actor = await createActor("billing-paid");
    const checkout = await createCardCheckout(actor);
    const stored = await orderRow(checkout.order.id);
    const order = { id: checkout.order.id, checkoutId: stored!.checkout_id! };
    const payload = checkoutPayload(order, { eventId: eventId("evt-paid") });

    const paid = await processAsaasCheckoutWebhook(payload);
    const duplicate = await processAsaasCheckoutWebhook(payload);
    const canceled = await processAsaasCheckoutWebhook(
      checkoutPayload(order, {
        event: "CHECKOUT_CANCELED",
        eventId: eventId("evt-canceled-after-paid"),
      }),
    );
    const status = await getBillingStatus(actor);

    expect(paid).toMatchObject({ granted: true, outcome: "paid" });
    expect(duplicate).toMatchObject({ duplicate: true });
    expect(canceled).toMatchObject({ outcome: "ignored_paid" });
    expect(status).toMatchObject({
      plan: "pro",
      checkoutEnabled: true,
      recurringRenewal: "not_configured",
    });
    expect(status.paidUntil).toBeTruthy();
  });

  it("processAsaasCheckoutWebhook_spoofedAccountAndOfferDoNotGrantAccess", async () => {
    const actor = await createActor("billing-spoof");
    const checkout = await createCardCheckout(actor);
    const stored = await orderRow(checkout.order.id);
    const order = { id: checkout.order.id, checkoutId: stored!.checkout_id! };

    await expect(
      processAsaasCheckoutWebhook(
        checkoutPayload(order, {
          accountId: "different-account",
          eventId: eventId("evt-spoof-account"),
        }),
      ),
    ).rejects.toMatchObject({ code: "BILLING_WEBHOOK_INVALID" });

    const wrongValue = await processAsaasCheckoutWebhook(
      checkoutPayload(order, { itemValue: 10, eventId: eventId("evt-spoof-value") }),
    );
    const documentedCardVariant = await processAsaasCheckoutWebhook(
      checkoutPayload(order, {
        billingTypes: ["MUNDIPAGG_CIELO"],
        eventId: eventId("evt-documented-variant"),
      }),
    );
    const status = await getBillingStatus(actor);

    expect(wrongValue).toMatchObject({ granted: false, outcome: "rejected_offer" });
    expect(documentedCardVariant).toMatchObject({
      granted: false,
      outcome: "rejected_offer",
    });
    expect(status.plan).toBe("free");
  });

  it("processAsaasCheckoutWebhook_terminalFailureDoesNotReopenOnOldCreated", async () => {
    const actor = await createActor("billing-ordering");
    const checkout = await createCardCheckout(actor);
    const stored = await orderRow(checkout.order.id);
    const order = { id: checkout.order.id, checkoutId: stored!.checkout_id! };

    const canceled = await processAsaasCheckoutWebhook(
      checkoutPayload(order, {
        event: "CHECKOUT_CANCELED",
        eventId: eventId("evt-canceled-first"),
      }),
    );
    const lateCreated = await processAsaasCheckoutWebhook(
      checkoutPayload(order, {
        event: "CHECKOUT_CREATED",
        eventId: eventId("evt-created-late"),
      }),
    );
    const persisted = await orderRow(order.id);

    expect(canceled).toMatchObject({ outcome: "checkout_canceled" });
    expect(lateCreated).toMatchObject({ outcome: "ignored_out_of_order" });
    expect(persisted?.status).toBe("failed");
  });

  it("processAsaasCheckoutWebhook_correlatesPaidEventBeforeCheckoutPersistence", async () => {
    const actor = await createActor("billing-early");
    const orderId = randomUUID();
    const checkoutId = `checkout-early-${randomUUID()}`;
    await isolated.pool!.query(
      `
        INSERT INTO billing_order (
          id, user_id, external_reference, method, amount_cents, currency,
          status, checkout_expires_at
        ) VALUES ($1, $2, $3, 'card', 2990, 'BRL', 'creating', NOW() + INTERVAL '1 hour')
      `,
      [orderId, actor, `billing-order:${orderId}`],
    );

    const result = await processAsaasCheckoutWebhook(
      checkoutPayload({ id: orderId, checkoutId }, { eventId: eventId("evt-early-paid") }),
    );
    const status = await getBillingStatus(actor);

    expect(result).toMatchObject({ granted: true, outcome: "paid" });
    expect(status.plan).toBe("pro");
    expect((await orderRow(orderId))?.checkout_id).toBe(checkoutId);
  });

  it("processAsaasCheckoutWebhook_unmatchedPaidIsRetriableAndWebhookTokenIsStrict", async () => {
    expect(verifyAsaasWebhookToken(webhookToken)).toBe(true);
    expect(verifyAsaasWebhookToken("wrong-token")).toBe(false);

    const unmatchedPayload = {
      id: eventId("evt-unmatched-paid"),
      event: "CHECKOUT_PAID",
      account: { id: sandboxAccountId },
      checkout: {
        id: "checkout-unmatched",
        billingTypes: ["CREDIT_CARD"],
        chargeTypes: ["RECURRENT"],
        items: [{ name: "PreçoPronto PRO", quantity: 1, value: 29.9 }],
      },
    };

    await expect(processAsaasCheckoutWebhook(unmatchedPayload)).rejects.toMatchObject({
      code: "BILLING_WEBHOOK_RETRY",
    });

    const response = await webhookPost(
      new NextRequest("http://localhost:3101/api/billing/webhook", {
        method: "POST",
        headers: {
          "asaas-access-token": webhookToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...unmatchedPayload, id: eventId("evt-unmatched-route") }),
      }),
    );

    const events = await isolated.pool!.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM billing_webhook_event WHERE event_id = $1",
      [unmatchedPayload.id],
    );

    expect(Number(events.rows[0]?.count ?? 0)).toBe(0);
    expect(response.status).toBe(503);
  });

  it("addOneCalendarMonth_preservesEndOfMonthInSaoPaulo", () => {
    const periodEnd = addOneCalendarMonth(new Date("2026-01-31T15:00:00.000Z"));

    expect(saoPauloToday(periodEnd)).toBe("2026-02-28");
  });
});
