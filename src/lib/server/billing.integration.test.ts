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
  pixCheckout: vi.fn(),
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
    createPixCheckout: isolated.pixCheckout,
  }),
}));

import {
  addOneCalendarMonth,
  createCardCheckout,
  createPixCheckout,
  getBillingStatus,
  isSandboxCheckoutEnabled,
  processAsaasCheckoutWebhook,
  saoPauloToday,
  verifyAsaasWebhookToken,
} from "./billing";
import { listProducts } from "./products";

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
  "ASAAS_SANDBOX_CALLBACK_ORIGIN",
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
    itemName?: string;
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
          name: options.itemName ?? (options.billingTypes?.includes("PIX")
            ? "Líquido PRO — 1 mês"
            : "Líquido PRO"),
          quantity: 1,
          value: options.itemValue ?? 29.9,
        },
      ],
      subscription: { id: `sub_${order.id.replaceAll("-", "")}` },
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
    process.env.ASAAS_SANDBOX_CALLBACK_ORIGIN = "https://checkout.precopronto.test";
    process.env.BETTER_AUTH_URL = "http://localhost:3101";

    const url = testDatabaseUrl();
    isolated.pool = new Pool({ connectionString: url.toString() });
    const [productsSql, billingSql, pixBillingSql, subscriptionSql, paymentsSql, accountDataSql] = await Promise.all([
      readFile(new URL("../../../migrations/0002_products.sql", import.meta.url), "utf8"),
      readFile(new URL("../../../migrations/0005_billing.sql", import.meta.url), "utf8"),
      readFile(new URL("../../../migrations/0006_pix_billing.sql", import.meta.url), "utf8"),
      readFile(new URL("../../../migrations/0007_subscription_lifecycle.sql", import.meta.url), "utf8"),
      readFile(new URL("../../../migrations/0008_subscription_payments.sql", import.meta.url), "utf8"),
      readFile(new URL("../../../migrations/0009_account_data_requests.sql", import.meta.url), "utf8"),
    ]);

    await isolated.pool.query(productsSql);
    await isolated.pool.query(billingSql);
    await isolated.pool.query(pixBillingSql);
    await isolated.pool.query(subscriptionSql);
    await isolated.pool.query(paymentsSql);
    await isolated.pool.query(accountDataSql);
  });

  beforeEach(() => {
    isolated.checkout.mockReset();
    isolated.pixCheckout.mockReset();
    isolated.checkout.mockImplementation(async (input: { externalReference: string }) => ({
      id: `checkout-${randomUUID()}`,
      link: "https://sandbox.asaas.com/checkoutSession/show/test",
      status: "ACTIVE",
      externalReference: input.externalReference,
    }));
    isolated.pixCheckout.mockImplementation(async (input: { externalReference: string }) => ({
      id: `pix-${randomUUID()}`,
      link: "https://sandbox.asaas.com/checkoutSession/show/pix-test",
      status: "ACTIVE",
      externalReference: input.externalReference,
    }));
  });

  it("createCardCheckout_httpCallback_blocksBeforeCreatingOrder", async () => {
    const actor = await createActor("billing-callback");
    const original = process.env.ASAAS_SANDBOX_CALLBACK_ORIGIN;
    process.env.ASAAS_SANDBOX_CALLBACK_ORIGIN = "http://localhost:3101";
    try {
      expect(isSandboxCheckoutEnabled()).toBe(false);
      await expect(createCardCheckout(actor)).rejects.toMatchObject({
        code: "BILLING_CHECKOUT_DISABLED",
      });
      const orders = await isolated.pool!.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM billing_order WHERE user_id = $1",
        [actor],
      );
      expect(Number(orders.rows[0]?.count ?? 0)).toBe(0);
    } finally {
      process.env.ASAAS_SANDBOX_CALLBACK_ORIGIN = original;
    }
  });

  it("createCardCheckout_pendingDeletion_doesNotCreateNewCharge", async () => {
    const actor = await createActor("billing-deletion");
    await isolated.pool!.query(
      "INSERT INTO account_deletion_request (id, user_id) VALUES ($1, $2)",
      [randomUUID(), actor],
    );
    await expect(createCardCheckout(actor)).rejects.toMatchObject({ code: "BILLING_DELETION_PENDING" });
    expect(isolated.checkout).not.toHaveBeenCalled();
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
      successUrl: "https://checkout.precopronto.test/app/plano?retorno=sucesso",
      cancelUrl: "https://checkout.precopronto.test/app/plano?retorno=cancelado",
      expiredUrl: "https://checkout.precopronto.test/app/plano?retorno=expirado",
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

  it("createPixCheckout_createsPixOrderAndRejectsMethodMixWhileOpen", async () => {
    const actor = await createActor("billing-pix-method");
    const pix = await createPixCheckout(actor);

    await expect(createCardCheckout(actor)).rejects.toMatchObject({
      code: "BILLING_METHOD_CONFLICT",
    });

    expect(pix.order).toMatchObject({ method: "pix", status: "checkout_created" });
    expect(isolated.pixCheckout).toHaveBeenCalledOnce();
    expect(isolated.checkout).not.toHaveBeenCalled();
  });

  it("processAsaasCheckoutWebhook_pixPaidGrantsOneMonthAndLatePaymentWinsExpiry", async () => {
    const actor = await createActor("billing-pix-late");
    const pix = await createPixCheckout(actor);
    const stored = await orderRow(pix.order.id);
    const order = { id: pix.order.id, checkoutId: stored!.checkout_id! };

    const expired = await processAsaasCheckoutWebhook(
      checkoutPayload(order, {
        event: "CHECKOUT_EXPIRED",
        eventId: eventId("evt-pix-expired"),
        billingTypes: ["PIX"],
        chargeTypes: ["DETACHED"],
      }),
    );
    const latePaid = await processAsaasCheckoutWebhook(
      checkoutPayload(order, {
        event: "CHECKOUT_PAID",
        eventId: eventId("evt-pix-late-paid"),
        billingTypes: ["PIX"],
        chargeTypes: ["DETACHED"],
      }),
    );
    const duplicate = await processAsaasCheckoutWebhook(
      checkoutPayload(order, {
        event: "CHECKOUT_PAID",
        eventId: eventId("evt-pix-late-paid-second"),
        billingTypes: ["PIX"],
        chargeTypes: ["DETACHED"],
        itemName: "PreçoPronto PRO — 1 mês",
      }),
    );
    const status = await getBillingStatus(actor);

    expect(expired).toMatchObject({ outcome: "checkout_expired", granted: false });
    expect(latePaid).toMatchObject({ outcome: "paid", granted: true });
    expect(duplicate).toMatchObject({ outcome: "already_paid", granted: false });
    expect(status).toMatchObject({ plan: "pro", order: { method: "pix" } });
    expect(status.paidUntil).toBeTruthy();
  });

  it("createPixCheckout_manualRenewalOnlyAfterCurrentPeriodExpires", async () => {
    const actor = await createActor("billing-pix-renewal");
    const pix = await createPixCheckout(actor);
    const stored = await orderRow(pix.order.id);

    await processAsaasCheckoutWebhook(
      checkoutPayload(
        { id: pix.order.id, checkoutId: stored!.checkout_id! },
        {
          eventId: eventId("evt-pix-renewal-first-paid"),
          billingTypes: ["PIX"],
          chargeTypes: ["DETACHED"],
        },
      ),
    );

    await expect(createPixCheckout(actor)).rejects.toMatchObject({
      code: "BILLING_ALREADY_PRO",
    });

    await isolated.pool!.query(
      "UPDATE account_entitlement SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1",
      [actor],
    );

    const renewal = await createPixCheckout(actor);

    expect(renewal.order).toMatchObject({ method: "pix", status: "checkout_created" });
  });

  it("processAsaasCheckoutWebhook_latePixAndSecondOrderGrantOnlyOneRight", async () => {
    const actor = await createActor("billing-pix-double");
    const pix = await createPixCheckout(actor);
    const pixStored = await orderRow(pix.order.id);
    const pixOrder = { id: pix.order.id, checkoutId: pixStored!.checkout_id! };

    await processAsaasCheckoutWebhook(
      checkoutPayload(pixOrder, {
        event: "CHECKOUT_EXPIRED",
        eventId: eventId("evt-double-expired"),
        billingTypes: ["PIX"],
        chargeTypes: ["DETACHED"],
      }),
    );

    const secondPix = await createPixCheckout(actor);
    const secondPixStored = await orderRow(secondPix.order.id);
    const secondPixOrder = {
      id: secondPix.order.id,
      checkoutId: secondPixStored!.checkout_id!,
    };

    const pixPaid = await processAsaasCheckoutWebhook(
      checkoutPayload(pixOrder, {
        event: "CHECKOUT_PAID",
        eventId: eventId("evt-double-second-pix-paid"),
        billingTypes: ["PIX"],
        chargeTypes: ["DETACHED"],
      }),
    );
    const paidUntil = (await getBillingStatus(actor)).paidUntil;
    const secondPixPaid = await processAsaasCheckoutWebhook(
      checkoutPayload(secondPixOrder, {
        event: "CHECKOUT_PAID",
        eventId: eventId("evt-double-pix-paid"),
        billingTypes: ["PIX"],
        chargeTypes: ["DETACHED"],
      }),
    );
    const status = await getBillingStatus(actor);

    expect(pixPaid).toMatchObject({ granted: true, outcome: "paid" });
    expect(secondPixPaid).toMatchObject({
      granted: false,
      outcome: "paid_duplicate_financial",
    });
    expect((await orderRow(pixOrder.id))?.status).toBe("paid");
    expect((await orderRow(secondPixOrder.id))?.status).toBe("paid");
    expect(status.paidUntil).toBe(paidUntil);
  });

  it("processAsaasCheckoutWebhook_cardOrderRejectsPixPayload", async () => {
    const actor = await createActor("billing-card-pix-spoof");
    const card = await createCardCheckout(actor);
    const stored = await orderRow(card.order.id);
    const result = await processAsaasCheckoutWebhook(
      checkoutPayload(
        { id: card.order.id, checkoutId: stored!.checkout_id! },
        {
          eventId: eventId("evt-card-with-pix"),
          billingTypes: ["PIX"],
          chargeTypes: ["DETACHED"],
        },
      ),
    );

    expect(result).toMatchObject({ granted: false, outcome: "rejected_offer" });
    expect((await getBillingStatus(actor)).plan).toBe("free");
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

  it("processAsaasCheckoutWebhook_paidCard_preservesSavedCatalog", async () => {
    const actor = await createActor("billing-catalog");
    const productId = randomUUID();
    await isolated.pool!.query(`
      INSERT INTO catalog_product (
        id, user_id, sku, name, product_cost, packaging, seller_shipping,
        tax_percent, commission_percent, fixed_fee, desired_margin_percent,
        channel_id, tariff_mode, evaluated_draft, evaluated_result, rule_version
      ) VALUES ($1, $2, 'QA-SKU', 'Produto salvo', 10, 0, 0, 0, 10, 0, 20,
        'shopee', 'manual', '{}'::jsonb, '{}'::jsonb, 'qa-rule')
    `, [productId, actor]);
    const before = await listProducts(actor);
    const checkout = await createCardCheckout(actor);
    const stored = await orderRow(checkout.order.id);

    const paid = await processAsaasCheckoutWebhook(checkoutPayload(
      { id: checkout.order.id, checkoutId: stored!.checkout_id! },
      { eventId: eventId("evt-catalog-paid") },
    ));
    const after = await listProducts(actor);

    expect(paid).toMatchObject({ granted: true, outcome: "paid" });
    expect(before.entitlement).toMatchObject({ plan: "free", count: 1 });
    expect(after.entitlement).toMatchObject({ plan: "pro", count: 1 });
    expect(after.products).toMatchObject(before.products);
    expect(after.products[0]).toMatchObject({ id: productId, sku: "QA-SKU", editable: true });
  });

  it("createCheckout_expiredProWithUncancelledCard_blocksSecondRecurringCharge", async () => {
    const actor = await createActor("billing-old-card");
    const checkout = await createCardCheckout(actor);
    const stored = await orderRow(checkout.order.id);
    await processAsaasCheckoutWebhook(checkoutPayload({
      id: checkout.order.id, checkoutId: stored!.checkout_id!,
    }));
    await isolated.pool!.query("UPDATE account_entitlement SET expires_at = NOW() - INTERVAL '1 day' WHERE user_id = $1", [actor]);
    await expect(createCardCheckout(actor)).rejects.toMatchObject({ code: "BILLING_SUBSCRIPTION_ACTIVE" });
    await expect(createPixCheckout(actor)).rejects.toMatchObject({ code: "BILLING_SUBSCRIPTION_ACTIVE" });
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
    const wrongName = await processAsaasCheckoutWebhook(
      checkoutPayload(order, { itemName: "Outro produto", eventId: eventId("evt-spoof-name") }),
    );
    const documentedCardVariant = await processAsaasCheckoutWebhook(
      checkoutPayload(order, {
        billingTypes: ["MUNDIPAGG_CIELO"],
        eventId: eventId("evt-documented-variant"),
      }),
    );
    const status = await getBillingStatus(actor);

    expect(wrongValue).toMatchObject({ granted: false, outcome: "rejected_offer" });
    expect(wrongName).toMatchObject({ granted: false, outcome: "rejected_offer" });
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
      checkoutPayload({ id: orderId, checkoutId }, {
        eventId: eventId("evt-early-paid"), itemName: "PreçoPronto PRO",
      }),
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
