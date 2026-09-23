import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Product, ProductWriteInput } from "@/lib/products";
import type { AsaasSandboxSubscriptionClient } from "./asaas-subscription-client";
import { AsaasSubscriptionClientError } from "./asaas-subscription-client";

config({ path: ".env.local", quiet: true });

const isolated = vi.hoisted(() => ({ pool: null as Pool | null, email: vi.fn() }));
vi.mock("./db", () => ({ getDb: () => isolated.pool }));
vi.mock("./mailer", () => ({ sendSubscriptionCancellationEmail: isolated.email }));

import { cancelCardSubscription, reconcileCardSubscription, recoverPaidCheckout, verifyCardCancellation } from "./subscription-lifecycle";
import { processSubscriptionPaymentWebhook } from "./subscription-payment-webhook";
import { processSubscriptionWebhook } from "./subscription-payment-webhook";
import { applyBillingOrderReconciliation, inspectBillingOrderReconciliation } from "./billing-reconciliation";
import { addOneCalendarMonth, processAsaasCheckoutWebhook, saoPauloToday } from "./billing";
import {
  createProduct,
  exportProductsForPortability,
  listProducts,
  selectEditableProducts,
  updateProduct,
} from "./products";

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const users: string[] = [];
const accountId = "sandbox-subscription-test-account";
const priorAccountId = process.env.ASAAS_SANDBOX_ACCOUNT_ID;

const catalogDraft = {
  version: 1,
  channelId: "shopee",
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
} as const;

function catalogProductInput(sku: string, name = `Produto ${sku}`): ProductWriteInput {
  return {
    sku,
    name,
    draft: structuredClone(catalogDraft),
    currentPrice: 120,
  };
}

async function createOverLimitCatalog(userId: string, prefix: string): Promise<Product[]> {
  const products: Product[] = [];

  for (let index = 1; index <= 6; index += 1) {
    products.push(await createProduct(userId, catalogProductInput(`${prefix}-${index}`)));
  }

  return products;
}

function provider(overrides: Partial<AsaasSandboxSubscriptionClient> = {}): AsaasSandboxSubscriptionClient {
  return {
    findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
      checkoutSession, subscriptionId: "sub_test_123", paymentId: "pay_test_123",
      paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
    })),
    findCheckoutPaymentBySession: vi.fn(async () => undefined),
    findInitialPaymentBySubscription: vi.fn(async () => undefined),
    listPaymentsForSubscription: vi.fn(async () => []),
    getPayment: vi.fn(async () => { throw new Error("getPayment não configurado neste teste"); }),
    getSubscription: vi.fn(async (id) => ({
      id, status: "ACTIVE", cycle: "MONTHLY", billingType: "CREDIT_CARD", value: 29.9,
    })),
    isSubscriptionDeleted: vi.fn(async () => false),
    cancelSubscription: vi.fn(async (id) => ({ id, cancelled: true as const })),
    ...overrides,
  };
}

async function actor(): Promise<{ userId: string; orderId: string; checkoutId: string }> {
  const userId = randomUUID();
  const orderId = randomUUID();
  const checkoutId = `checkout-${randomUUID()}`;
  users.push(userId);
  await isolated.pool!.query(`
    INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt",
      terms_accepted, terms_version, privacy_version, marketing_consent)
    VALUES ($1, 'Teste', $2, TRUE, NOW(), NOW(), TRUE, '2026-09-22', '2026-09-22', FALSE)
  `, [userId, `${userId}@precopronto.test`]);
  await isolated.pool!.query(`
    INSERT INTO billing_order (id, user_id, external_reference, method, amount_cents, currency,
      status, checkout_id, checkout_expires_at, paid_at, period_start, period_end)
    VALUES ($1, $2, $3, 'card', 2990, 'BRL', 'paid', $4, NOW() + INTERVAL '1 hour',
      NOW(), NOW(), NOW() + INTERVAL '1 month')
  `, [orderId, userId, `billing-order:${orderId}`, checkoutId]);
  await isolated.pool!.query(`
    INSERT INTO account_entitlement (user_id, plan, expires_at, updated_at)
    VALUES ($1, 'pro', NOW() + INTERVAL '1 month', NOW())
  `, [userId]);
  return { userId, orderId, checkoutId };
}

async function reopenCheckout(userId: string, orderId: string, retainPro = false): Promise<void> {
  await isolated.pool!.query(`
    UPDATE billing_order SET status = 'checkout_created', paid_at = NULL,
      period_start = NULL, period_end = NULL, subscription_id = NULL,
      initial_payment_id = NULL WHERE id = $1
  `, [orderId]);
  if (!retainPro) {
    await isolated.pool!.query(
      "UPDATE account_entitlement SET plan = 'free', expires_at = NULL WHERE user_id = $1",
      [userId],
    );
  }
}

suite("subscription lifecycle integration", () => {
  beforeAll(async () => {
    process.env.ASAAS_SANDBOX_ACCOUNT_ID = accountId;
    const url = new URL(process.env.TEST_DATABASE_URL!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/precopronto_integration") throw new Error("Use the dedicated loopback test database.");
    isolated.pool = new Pool({ connectionString: url.toString() });
    const migrations = await Promise.all(["0002_products.sql", "0005_billing.sql", "0006_pix_billing.sql", "0007_subscription_lifecycle.sql", "0008_subscription_payments.sql"].map(
      (name) => readFile(new URL(`../../../migrations/${name}`, import.meta.url), "utf8"),
    ));
    for (const sql of migrations) await isolated.pool.query(sql);
  });
  afterAll(async () => {
    if (!isolated.pool) return;
    await isolated.pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [users]);
    await isolated.pool.end();
    isolated.pool = null;
    if (priorAccountId === undefined) delete process.env.ASAAS_SANDBOX_ACCOUNT_ID;
    else process.env.ASAAS_SANDBOX_ACCOUNT_ID = priorAccountId;
  });

  it("reconcileCardSubscription_matchingCheckout_linksOnlyOwner", async () => {
    const first = await actor();
    const second = await actor();
    const api = provider();
    const result = await reconcileCardSubscription(first.userId, api);
    expect(result.subscription).toEqual({ linked: true, cancellationState: "not_requested" });
    const rows = await isolated.pool!.query("SELECT user_id, subscription_id, initial_payment_id FROM billing_order WHERE id = ANY($1::text[])", [[first.orderId, second.orderId]]);
    expect(rows.rows.find((row) => row.user_id === first.userId)).toMatchObject({ subscription_id: "sub_test_123", initial_payment_id: "pay_test_123" });
    expect(rows.rows.find((row) => row.user_id === second.userId)).toMatchObject({ subscription_id: null });
  });

  it("reconcileCardSubscription_wrongPayment_rejectsWithoutLink", async () => {
    const { userId, orderId } = await actor();
    const api = provider({ findSubscriptionByCheckoutSession: vi.fn(async () => ({
      checkoutSession: "other-checkout", subscriptionId: "sub_other", paymentId: "pay_other",
      paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
    })) });
    await expect(reconcileCardSubscription(userId, api)).rejects.toMatchObject({ code: "RECONCILIATION_INVALID" });
    const row = await isolated.pool!.query("SELECT subscription_id FROM billing_order WHERE id = $1", [orderId]);
    expect(row.rows[0].subscription_id).toBeNull();
  });

  it("recoverPaidCheckout_confirmedCard_restoresLostCheckoutWebhook", async () => {
    const { userId, orderId } = await actor();
    await isolated.pool!.query(`
      UPDATE billing_order SET status = 'checkout_created', paid_at = NULL,
        period_start = NULL, period_end = NULL WHERE id = $1
    `, [orderId]);
    await isolated.pool!.query("DELETE FROM account_entitlement WHERE user_id = $1", [userId]);
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const api = provider({ findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
      checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
      paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
    })) });
    const result = await recoverPaidCheckout(userId, api);
    expect(result.plan).toBe("pro");
    expect(result.subscription?.linked).toBe(true);
    const order = await isolated.pool!.query("SELECT status, period_end FROM billing_order WHERE id = $1", [orderId]);
    expect(order.rows[0].status).toBe("paid");
    expect(new Date(order.rows[0].period_end).getTime()).toBeGreaterThan(Date.now());
  });

  it("recoverPaidCheckout_unconfirmedCard_doesNotGrant", async () => {
    const { userId, orderId } = await actor();
    await isolated.pool!.query("UPDATE billing_order SET status = 'checkout_created', paid_at = NULL, period_end = NULL WHERE id = $1", [orderId]);
    await isolated.pool!.query("DELETE FROM account_entitlement WHERE user_id = $1", [userId]);
    const api = provider({ findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
      checkoutSession, subscriptionId: "sub_unconfirmed", paymentId: "pay_unconfirmed",
      paymentStatus: "PENDING", billingType: "CREDIT_CARD", value: 29.9,
    })) });
    await expect(recoverPaidCheckout(userId, api)).rejects.toMatchObject({ code: "RECONCILIATION_UNAVAILABLE" });
    const order = await isolated.pool!.query("SELECT status FROM billing_order WHERE id = $1", [orderId]);
    expect(order.rows[0].status).toBe("checkout_created");
  });

  it("recoverPaidCheckout_receivedPix_restoresLostCheckoutWebhook", async () => {
    const { userId, orderId } = await actor();
    await isolated.pool!.query(`
      UPDATE billing_order SET method = 'pix', status = 'checkout_created',
        paid_at = NULL, period_start = NULL, period_end = NULL WHERE id = $1
    `, [orderId]);
    await isolated.pool!.query("DELETE FROM account_entitlement WHERE user_id = $1", [userId]);
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const api = provider({ findCheckoutPaymentBySession: vi.fn(async (checkoutSession) => ({
      checkoutSession, paymentId, paymentStatus: "RECEIVED", billingType: "PIX", value: 29.9,
    })) });
    const result = await recoverPaidCheckout(userId, api);
    expect(result.plan).toBe("pro");
    expect(result.subscription).toBeUndefined();
    expect(api.getSubscription).not.toHaveBeenCalled();
    const row = await isolated.pool!.query("SELECT status, initial_payment_id FROM billing_order WHERE id = $1", [orderId]);
    expect(row.rows[0]).toMatchObject({ status: "paid", initial_payment_id: paymentId });
  });

  it("paymentConfirmedBeforeCheckoutPaid_reconcilesExactOpenCheckoutOnce", async () => {
    const { userId, orderId, checkoutId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await reopenCheckout(userId, orderId);

    const api = provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
        dueDate: saoPauloToday(),
      })),
    });
    const confirmed = await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: {
        id: paymentId, subscription: subscriptionId, checkoutSession: checkoutId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday(), status: "CONFIRMED",
      },
    }, api);

    expect(confirmed).toMatchObject({ granted: true, outcome: "confirmed" });
    const paid = await isolated.pool!.query<{
      status: string;
      subscription_id: string | null;
      initial_payment_id: string | null;
      period_end: Date | null;
    }>("SELECT status, subscription_id, initial_payment_id, period_end FROM billing_order WHERE id = $1", [orderId]);
    expect(paid.rows[0]).toMatchObject({
      status: "paid", subscription_id: subscriptionId, initial_payment_id: paymentId,
    });
    expect(paid.rows[0]?.period_end).toBeTruthy();

    const checkoutPaid = await processAsaasCheckoutWebhook({
      id: randomUUID(), event: "CHECKOUT_PAID", account: { id: accountId },
      checkout: {
        id: checkoutId, externalReference: `billing-order:${orderId}`, status: "PAID",
        billingTypes: ["CREDIT_CARD"], chargeTypes: ["RECURRENT"],
        items: [{ name: "PreçoPronto PRO", quantity: 1, value: 29.9 }],
        subscription: { id: subscriptionId },
      },
    });

    expect(checkoutPaid).toMatchObject({ granted: false, outcome: "already_paid" });
    expect((await isolated.pool!.query("SELECT plan FROM account_entitlement WHERE user_id = $1", [userId])).rows[0].plan)
      .toBe("pro");
  });

  it("paymentConfirmedBeforeCheckoutPaid_mismatchedPaymentOrSubscription_neverGrants", async () => {
    for (const mismatch of ["payment", "subscription"] as const) {
      const { userId, orderId, checkoutId } = await actor();
      await reopenCheckout(userId, orderId);
      const actualPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
      const actualSubscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
      const eventId = randomUUID();
      const api = provider({ findSubscriptionByCheckoutSession: vi.fn(async () => ({
        checkoutSession: checkoutId, paymentId: actualPaymentId,
        subscriptionId: actualSubscriptionId, paymentStatus: "CONFIRMED",
        billingType: "CREDIT_CARD", value: 29.9,
      })) });
      const result = await processSubscriptionPaymentWebhook({
        id: eventId, event: "PAYMENT_CONFIRMED", account: { id: accountId },
        payment: {
          id: mismatch === "payment" ? `pay_${randomUUID().replaceAll("-", "")}` : actualPaymentId,
          subscription: mismatch === "subscription" ? `sub_${randomUUID().replaceAll("-", "")}` : actualSubscriptionId,
          checkoutSession: checkoutId, billingType: "CREDIT_CARD", value: 29.9,
          dueDate: saoPauloToday(), status: "CONFIRMED",
        },
      }, api);
      expect(result).toMatchObject({ granted: false, outcome: "rejected_correlation" });
      const order = await isolated.pool!.query(
        "SELECT status, subscription_id, initial_payment_id FROM billing_order WHERE id = $1", [orderId],
      );
      expect(order.rows[0]).toMatchObject({
        status: "checkout_created", subscription_id: null, initial_payment_id: null,
      });
      const entitlement = await isolated.pool!.query("SELECT plan FROM account_entitlement WHERE user_id = $1", [userId]);
      expect(entitlement.rows[0].plan).toBe("free");
      const audit = await isolated.pool!.query("SELECT outcome FROM billing_payment_event WHERE event_id = $1", [eventId]);
      expect(audit.rows[0].outcome).toBe("rejected_correlation");
    }
  });

  it("paymentConfirmedBeforeCheckoutPaid_transientProviderState_retriesSameEvent", async () => {
    const { userId, orderId, checkoutId } = await actor();
    await reopenCheckout(userId, orderId);
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const eventId = randomUUID();
    const payment = { checkoutSession: checkoutId, paymentId, subscriptionId,
      billingType: "CREDIT_CARD", value: 29.9 };
    const api = provider({
      findSubscriptionByCheckoutSession: vi.fn()
        .mockResolvedValueOnce({ ...payment, paymentStatus: "PENDING" })
        .mockResolvedValueOnce({ ...payment, paymentStatus: "CONFIRMED" })
        .mockResolvedValueOnce({ ...payment, paymentStatus: "CONFIRMED" }),
      getSubscription: vi.fn()
        .mockResolvedValueOnce({ id: subscriptionId, status: "INACTIVE", cycle: "MONTHLY", billingType: "CREDIT_CARD", value: 29.9 })
        .mockResolvedValueOnce({ id: subscriptionId, status: "ACTIVE", cycle: "MONTHLY", billingType: "CREDIT_CARD", value: 29.9 }),
    });
    const event = { id: eventId, event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: { id: paymentId, subscription: subscriptionId, checkoutSession: checkoutId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday(), status: "CONFIRMED" } };
    await expect(processSubscriptionPaymentWebhook(event, api)).rejects.toMatchObject({ code: "RETRY" });
    const before = await isolated.pool!.query("SELECT status FROM billing_order WHERE id = $1", [orderId]);
    expect(before.rows[0].status).toBe("checkout_created");
    const auditBefore = await isolated.pool!.query("SELECT COUNT(*)::int AS count FROM billing_payment_event WHERE event_id = $1", [eventId]);
    expect(auditBefore.rows[0].count).toBe(0);
    await expect(processSubscriptionPaymentWebhook(event, api)).rejects.toMatchObject({ code: "RETRY" });
    expect(await processSubscriptionPaymentWebhook(event, api)).toMatchObject({
      granted: true, outcome: "confirmed",
    });
    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).plan).toBe("pro");
  });

  it("paymentConfirmedBeforeCheckoutPaid_existingPro_reportsDuplicateFinancial", async () => {
    const { userId, orderId, checkoutId } = await actor();
    const original = await isolated.pool!.query("SELECT expires_at FROM account_entitlement WHERE user_id = $1", [userId]);
    await reopenCheckout(userId, orderId, true);
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const eventId = randomUUID();
    const api = provider({ findSubscriptionByCheckoutSession: vi.fn(async () => ({
      checkoutSession: checkoutId, paymentId, subscriptionId,
      paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
    })) });
    const result = await processSubscriptionPaymentWebhook({
      id: eventId, event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: { id: paymentId, subscription: subscriptionId, checkoutSession: checkoutId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday(), status: "CONFIRMED" },
    }, api);
    expect(result).toMatchObject({ granted: false, outcome: "paid_duplicate_financial" });
    const after = await isolated.pool!.query("SELECT plan, expires_at FROM account_entitlement WHERE user_id = $1", [userId]);
    expect(after.rows[0].plan).toBe("pro");
    expect(new Date(after.rows[0].expires_at).getTime()).toBe(new Date(original.rows[0].expires_at).getTime());
    const audit = await isolated.pool!.query("SELECT outcome FROM billing_payment_event WHERE event_id = $1", [eventId]);
    expect(audit.rows[0].outcome).toBe("paid_duplicate_financial");
  });

  it("paymentConfirmedAfterCheckoutPaid_mismatchedIds_neverLinksWrongSubscription", async () => {
    const { userId, orderId, checkoutId } = await actor();
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const api = provider({ findCheckoutPaymentBySession: vi.fn(async () => ({
      checkoutSession: checkoutId, paymentId, subscriptionId,
      paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
    })) });
    const event = (id: string, subscription: string) => ({
      id: randomUUID(), event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: { id, subscription, checkoutSession: checkoutId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday(), status: "CONFIRMED" },
    });
    for (const mismatch of [event(`pay_${randomUUID().replaceAll("-", "")}`, subscriptionId),
      event(paymentId, `sub_${randomUUID().replaceAll("-", "")}`)]) {
      expect(await processSubscriptionPaymentWebhook(mismatch, api)).toMatchObject({
        granted: false, outcome: "rejected_correlation",
      });
      const row = await isolated.pool!.query(
        "SELECT subscription_id, initial_payment_id FROM billing_order WHERE id = $1", [orderId],
      );
      expect(row.rows[0]).toMatchObject({ subscription_id: null, initial_payment_id: null });
    }
    expect(await processSubscriptionPaymentWebhook(event(paymentId, subscriptionId), api))
      .toMatchObject({ granted: false, outcome: "confirmed" });
    const linked = await isolated.pool!.query(
      "SELECT subscription_id, initial_payment_id FROM billing_order WHERE id = $1", [orderId],
    );
    expect(linked.rows[0]).toMatchObject({ subscription_id: subscriptionId, initial_payment_id: paymentId });
    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).plan).toBe("pro");
  });

  it("paymentWebhook_externalAsaasCharges_areAcknowledgedWithoutGrant", async () => {
    const outside = {
      id: randomUUID(), event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: { id: `pay_${randomUUID().replaceAll("-", "")}`,
        subscription: `sub_${randomUUID().replaceAll("-", "")}`,
        billingType: "CREDIT_CARD", value: 99.9,
        status: "CONFIRMED", dueDate: saoPauloToday() },
    };
    const api = provider({ findInitialPaymentBySubscription: vi.fn(async () => undefined) });
    expect(await processSubscriptionPaymentWebhook(outside, api)).toMatchObject({
      granted: false, outcome: "ignored_external",
    });
    expect(api.findInitialPaymentBySubscription).not.toHaveBeenCalled();
    expect(await processSubscriptionPaymentWebhook({ ...outside, id: randomUUID(),
      payment: { ...outside.payment, value: 29.9 } }, api)).toMatchObject({
      granted: false, outcome: "ignored_external",
    });
    const audit = await isolated.pool!.query("SELECT COUNT(*)::int AS count FROM billing_payment_event WHERE event_id = $1", [outside.id]);
    expect(audit.rows[0].count).toBe(0);
  });

  it("paymentWebhook_knownSubscriptionWrongValue_failsClosed", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    await expect(processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: { id: `pay_${randomUUID().replaceAll("-", "")}`,
        subscription: subscriptionId, billingType: "CREDIT_CARD",
        value: 19.9, dueDate: saoPauloToday(), status: "CONFIRMED" },
    })).rejects.toMatchObject({ code: "INVALID" });
  });

  it("cancelCardSubscription_confirmed_preservesPaidAccessAndAvoidsSecondDelete", async () => {
    const { userId } = await actor();
    const api = provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId: `sub_${randomUUID().replaceAll("-", "")}`,
        paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    });
    await reconcileCardSubscription(userId, api);
    const cancelled = await cancelCardSubscription(userId, api);
    expect(cancelled.plan).toBe("pro");
    expect(cancelled.subscription?.cancellationState).toBe("confirmed");
    expect((await cancelCardSubscription(userId, api)).subscription?.cancellationState).toBe("confirmed");
    expect(api.cancelSubscription).toHaveBeenCalledOnce();
    expect(isolated.email).toHaveBeenCalled();
  });

  it("cancelCardSubscription_timeout_doesNotRetryDeleteAndCanVerify", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const api = provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
      cancelSubscription: vi.fn(async () => { throw new Error("timeout"); }),
      getSubscription: vi.fn(async (id) => ({ id, deleted: true })),
    });
    await reconcileCardSubscription(userId, provider({ ...api, getSubscription: vi.fn(async (id) => ({ id, status: "ACTIVE", cycle: "MONTHLY", billingType: "CREDIT_CARD", value: 29.9 })) }));
    await expect(cancelCardSubscription(userId, api)).rejects.toMatchObject({ code: "CANCELLATION_PENDING" });
    await expect(cancelCardSubscription(userId, api)).rejects.toMatchObject({ code: "CANCELLATION_PENDING" });
    expect(api.cancelSubscription).toHaveBeenCalledOnce();
    expect((await verifyCardCancellation(userId, api)).subscription?.cancellationState).toBe("confirmed");
  });

  it("verifyCardCancellation_deletedListConfirmsAfterGet404", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const api = provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
      cancelSubscription: vi.fn(async () => { throw new Error("timeout"); }),
      getSubscription: vi.fn(async () => { throw new AsaasSubscriptionClientError("not found", "HTTP_ERROR", 404); }),
      isSubscriptionDeleted: vi.fn(async () => true),
    });
    await reconcileCardSubscription(userId, provider({ ...api,
      getSubscription: vi.fn(async (id) => ({ id, status: "ACTIVE", cycle: "MONTHLY", billingType: "CREDIT_CARD", value: 29.9 })) }));
    await expect(cancelCardSubscription(userId, api)).rejects.toMatchObject({ code: "CANCELLATION_PENDING" });
    expect((await verifyCardCancellation(userId, api)).subscription?.cancellationState).toBe("confirmed");
    expect(api.isSubscriptionDeleted).toHaveBeenCalledWith(subscriptionId);
  });

  it("paymentWebhook_renewalDuplicateAndRefund_recomputesAccessWithoutOldReactivation", async () => {
    const { userId, orderId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const initialPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: initialPaymentId,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    await isolated.pool!.query("UPDATE billing_order SET period_end = NOW() - INTERVAL '1 day' WHERE id = $1", [orderId]);
    await isolated.pool!.query("UPDATE billing_payment_cycle SET period_end = NOW() - INTERVAL '1 day' WHERE payment_id = $1", [initialPaymentId]);
    await isolated.pool!.query("UPDATE account_entitlement SET expires_at = NOW() - INTERVAL '1 day' WHERE user_id = $1", [userId]);
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const event = (id: string, type: string, payment = paymentId) => ({
      id, event: type, account: { id: accountId },
      payment: { id: payment, subscription: subscriptionId, billingType: "CREDIT_CARD",
        value: 29.9, dueDate: saoPauloToday(), status: type === "PAYMENT_CONFIRMED" ? "CONFIRMED" : undefined },
    });
    const confirmed = event(randomUUID(), "PAYMENT_CONFIRMED");
    expect(await processSubscriptionPaymentWebhook(confirmed)).toMatchObject({ granted: true, outcome: "confirmed" });
    expect(await processSubscriptionPaymentWebhook(confirmed)).toMatchObject({ duplicate: true });
    const active = await isolated.pool!.query("SELECT expires_at FROM account_entitlement WHERE user_id = $1", [userId]);
    expect(new Date(active.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(await processSubscriptionPaymentWebhook(event(randomUUID(), "PAYMENT_REFUNDED"))).toMatchObject({ outcome: "refunded" });
    expect(await processSubscriptionPaymentWebhook(event(randomUUID(), "PAYMENT_CONFIRMED"))).toMatchObject({ granted: false, outcome: "refunded" });
    const revoked = await isolated.pool!.query("SELECT plan FROM account_entitlement WHERE user_id = $1", [userId]);
    expect(revoked.rows[0].plan).toBe("free");
  });

  it("paymentWebhook_oldRefund_keepsNewerValidCycle", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const initialPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: initialPaymentId,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    const refund = {
      id: randomUUID(), event: "PAYMENT_REFUNDED", account: { id: accountId },
      payment: { id: initialPaymentId, subscription: subscriptionId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday() },
    };
    const nextId = `pay_${randomUUID().replaceAll("-", "")}`;
    const renewal = { ...refund, id: randomUUID(), event: "PAYMENT_CONFIRMED",
      payment: { ...refund.payment, id: nextId, status: "CONFIRMED" } };
    expect(await processSubscriptionPaymentWebhook(renewal)).toMatchObject({ outcome: "confirmed" });
    expect(await processSubscriptionPaymentWebhook(refund)).toMatchObject({ outcome: "refunded" });
    const status = await isolated.pool!.query("SELECT plan, expires_at FROM account_entitlement WHERE user_id = $1", [userId]);
    expect(status.rows[0].plan).toBe("pro");
    expect(new Date(status.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("paymentWebhook_captureRefusedAfterPaidPeriod_doesNotGrantGraceAndKeepsOverLimitCatalog", async () => {
    const { userId, orderId } = await actor();
    const products = await createOverLimitCatalog(userId, `NO-GRACE-${randomUUID()}`);
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const initialPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: initialPaymentId,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    await isolated.pool!.query(
      "UPDATE billing_order SET period_end = TIMESTAMPTZ '2026-01-31 23:59:59-03' WHERE id = $1",
      [orderId],
    );
    await isolated.pool!.query(
      "UPDATE billing_payment_cycle SET period_end = TIMESTAMPTZ '2026-01-31 23:59:59-03' WHERE payment_id = $1",
      [initialPaymentId],
    );
    await isolated.pool!.query(
      "UPDATE account_entitlement SET expires_at = TIMESTAMPTZ '2026-01-31 23:59:59-03' WHERE user_id = $1",
      [userId],
    );

    const refused = await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", account: { id: accountId },
      payment: {
        id: `pay_${randomUUID().replaceAll("-", "")}`, subscription: subscriptionId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: "2026-01-31",
      },
    });

    expect(refused).toMatchObject({ granted: false, outcome: "overdue" });
    const { getBillingStatus } = await import("./billing");
    const status = await getBillingStatus(userId);
    expect(status).toMatchObject({ plan: "free", renewalIssue: { dueDate: "2026-01-31" } });
    expect(status.paidUntil).toBeUndefined();

    const beforeSelection = await listProducts(userId);
    expect(beforeSelection.entitlement).toMatchObject({
      plan: "free", count: 6, requiresSelection: true, selectedEditableCount: 0,
    });
    expect(beforeSelection.products).toHaveLength(6);

    const selected = await selectEditableProducts(userId, {
      ids: products.slice(0, 5).map((product) => product.id),
    });
    expect(selected.selectedEditableCount).toBe(5);
    const afterSelection = await listProducts(userId);
    expect(afterSelection.products.filter((product) => product.editable)).toHaveLength(5);
    await expect(
      updateProduct(userId, products[0]!.id, products[0]!.version,
        catalogProductInput(products[0]!.sku, "Editável após expiração")),
    ).resolves.toMatchObject({ name: "Editável após expiração" });
    await expect(
      updateProduct(userId, products[5]!.id, products[5]!.version,
        catalogProductInput(products[5]!.sku, "Continua somente leitura")),
    ).rejects.toMatchObject({ code: "PRODUCT_READ_ONLY" });
    expect((await exportProductsForPortability(userId)).map((product) => product.id))
      .toEqual(expect.arrayContaining(products.map((product) => product.id)));
  });

  it("paymentWebhook_initialRefund_preservesCatalogForFreeSelectionAndPortability", async () => {
    const { userId } = await actor();
    const products = await createOverLimitCatalog(userId, `REFUND-${randomUUID()}`);
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const initialPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: initialPaymentId,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));

    expect(await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_REFUNDED", account: { id: accountId },
      payment: {
        id: initialPaymentId, subscription: subscriptionId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday(),
      },
    })).toMatchObject({ granted: false, outcome: "refunded" });

    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).plan).toBe("free");
    const freeCatalog = await listProducts(userId);
    expect(freeCatalog.entitlement).toMatchObject({
      plan: "free", count: 6, requiresSelection: true,
    });

    const selected = await selectEditableProducts(userId, {
      ids: products.slice(0, 5).map((product) => product.id),
    });
    expect(selected.selectedEditableCount).toBe(5);
    expect((await listProducts(userId)).products.filter((product) => product.editable))
      .toHaveLength(5);
    expect((await exportProductsForPortability(userId)).map((product) => product.id))
      .toEqual(expect.arrayContaining(products.map((product) => product.id)));
  });

  it("paymentWebhook_chargebackDoesNotReactivateAfterLateConfirmation", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const initialPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: initialPaymentId,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));

    const chargeback = {
      id: randomUUID(), event: "PAYMENT_CHARGEBACK_REQUESTED", account: { id: accountId },
      payment: {
        id: initialPaymentId, subscription: subscriptionId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday(),
      },
    } as const;
    expect(await processSubscriptionPaymentWebhook(chargeback)).toMatchObject({
      granted: false, outcome: "chargeback",
    });
    expect(await processSubscriptionPaymentWebhook({
      ...chargeback,
      id: randomUUID(),
      event: "PAYMENT_CONFIRMED",
      payment: { ...chargeback.payment, status: "CONFIRMED" },
    })).toMatchObject({ granted: false, outcome: "chargeback" });

    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).plan).toBe("free");
    const cycle = await isolated.pool!.query<{ state: string }>(
      "SELECT state FROM billing_payment_cycle WHERE payment_id = $1", [initialPaymentId],
    );
    expect(cycle.rows[0]?.state).toBe("chargeback");
  });

  it("paymentWebhook_confirmedRenewalThirtyDaysAhead_usesCalendarPeriodEnd", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    const dueDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const expectedPeriodEnd = addOneCalendarMonth(new Date(`${dueDate}T15:00:00.000Z`));

    expect(await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: {
        id: paymentId, subscription: subscriptionId, billingType: "CREDIT_CARD",
        value: 29.9, dueDate, status: "CONFIRMED",
      },
    })).toMatchObject({ granted: true, outcome: "confirmed" });

    const cycle = await isolated.pool!.query<{ period_end: Date }>(
      "SELECT period_end FROM billing_payment_cycle WHERE payment_id = $1", [paymentId],
    );
    expect(new Date(cycle.rows[0]!.period_end).getTime()).toBe(expectedPeriodEnd.getTime());
    const { getBillingStatus } = await import("./billing");
    expect(new Date((await getBillingStatus(userId)).paidUntil!).getTime())
      .toBe(expectedPeriodEnd.getTime());
  });

  it("paymentWebhook_dueDateBoundary_acceptsDay45AndRejectsDay46", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    const date = new Date(`${saoPauloToday()}T12:00:00.000Z`);
    const dueDateAfter = (days: number) => {
      const value = new Date(date);
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    const event = (days: number) => ({
      id: randomUUID(), event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: { id: `pay_${randomUUID().replaceAll("-", "")}`,
        subscription: subscriptionId, billingType: "CREDIT_CARD",
        value: 29.9, dueDate: dueDateAfter(days), status: "CONFIRMED" },
    });
    expect(await processSubscriptionPaymentWebhook(event(45))).toMatchObject({
      granted: true, outcome: "confirmed",
    });
    await expect(processSubscriptionPaymentWebhook(event(46))).rejects.toMatchObject({ code: "INVALID" });
  });

  it("inspectBillingOrderReconciliation_overdueRenewal_previewsThenRepairsCycleIdempotently", async () => {
    const { userId, orderId, checkoutId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const initialPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async () => ({
        checkoutSession: checkoutId, subscriptionId, paymentId: initialPaymentId,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    const future = new Date(`${saoPauloToday()}T12:00:00.000Z`);
    future.setUTCDate(future.getUTCDate() + 30);
    const originalDueDate = future.toISOString().slice(0, 10);
    const shifted = new Date(`${saoPauloToday()}T12:00:00.000Z`);
    shifted.setUTCDate(shifted.getUTCDate() - 1);
    const renewalId = `pay_${randomUUID().replaceAll("-", "")}`;
    const initial = { paymentId: initialPaymentId, subscriptionId, checkoutSession: checkoutId,
      paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      dueDate: saoPauloToday(), originalDueDate: saoPauloToday() };
    const renewal = { paymentId: renewalId, subscriptionId, paymentStatus: "OVERDUE",
      billingType: "CREDIT_CARD", value: 29.9,
      dueDate: shifted.toISOString().slice(0, 10), originalDueDate };
    const api = provider({
      listPaymentsForSubscription: vi.fn(async () => [renewal, initial]),
      getPayment: vi.fn(async () => initial),
    });
    const before = await isolated.pool!.query(
      "SELECT COUNT(*)::int AS count FROM billing_payment_cycle WHERE payment_id = $1", [renewalId],
    );
    const preview = await inspectBillingOrderReconciliation(orderId, api);
    expect(preview.candidates).toHaveLength(2);
    const afterPreview = await isolated.pool!.query(
      "SELECT COUNT(*)::int AS count FROM billing_payment_cycle WHERE payment_id = $1", [renewalId],
    );
    expect(afterPreview.rows[0].count).toBe(before.rows[0].count);
    expect(await applyBillingOrderReconciliation(preview)).toMatchObject({ processed: 2, plan: "pro" });
    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).renewalIssue?.dueDate).toBe(originalDueDate);
    expect(await applyBillingOrderReconciliation(preview)).toMatchObject({ duplicates: 2, plan: "pro" });
  });

  it("applyBillingOrderReconciliation_pixRefundLostWebhook_revokesOnlyPixRight", async () => {
    const { orderId, checkoutId } = await actor();
    await isolated.pool!.query("UPDATE billing_order SET method = 'pix' WHERE id = $1", [orderId]);
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_RECEIVED", account: { id: accountId },
      payment: { id: paymentId, checkoutSession: checkoutId, billingType: "PIX",
        value: 29.9, dueDate: saoPauloToday(), status: "RECEIVED" },
    });
    const api = provider({ getPayment: vi.fn(async () => ({
      paymentId, checkoutSession: checkoutId, paymentStatus: "REFUNDED",
      billingType: "PIX", value: 29.9, dueDate: saoPauloToday(),
    })) });
    const preview = await inspectBillingOrderReconciliation(orderId, api);
    expect(preview.candidates).toHaveLength(1);
    expect(await applyBillingOrderReconciliation(preview)).toMatchObject({ processed: 1, plan: "free" });
    expect((await isolated.pool!.query("SELECT state FROM billing_payment_cycle WHERE payment_id = $1", [paymentId])).rows[0].state)
      .toBe("refunded");
  });

  it("paymentWebhook_overdue_preservesPaidPeriodAndOffersInvoice", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    const { getBillingStatus } = await import("./billing");
    const before = await getBillingStatus(userId);
    const invoiceUrl = "https://sandbox.asaas.com/i/test-renewal";
    await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_OVERDUE", account: { id: accountId },
      payment: { id: `pay_${randomUUID().replaceAll("-", "")}`, subscription: subscriptionId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday(), invoiceUrl },
    });
    const after = await getBillingStatus(userId);
    expect(after.plan).toBe("pro");
    expect(Math.abs(new Date(after.paidUntil!).getTime() - new Date(before.paidUntil!).getTime())).toBeLessThan(1_000);
    expect(after.renewalIssue).toEqual({ dueDate: saoPauloToday(), invoiceUrl });
  });

  it("paymentWebhook_forcedOverdue_usesOriginalCycleDateAndRepairsOldOverdueRow", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    const anchor = new Date(`${saoPauloToday()}T12:00:00.000Z`);
    const shifted = new Date(anchor);
    shifted.setUTCDate(shifted.getUTCDate() - 1);
    const original = new Date(anchor);
    original.setUTCDate(original.getUTCDate() + 30);
    const dueDate = shifted.toISOString().slice(0, 10);
    const originalDueDate = original.toISOString().slice(0, 10);
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const payment = { id: paymentId, subscription: subscriptionId,
      billingType: "CREDIT_CARD", value: 29.9, dueDate, originalDueDate };
    expect(await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_OVERDUE", account: { id: accountId }, payment,
    })).toMatchObject({ granted: false, outcome: "overdue" });
    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).renewalIssue?.dueDate).toBe(originalDueDate);

    await isolated.pool!.query(`
      UPDATE billing_payment_cycle SET due_date = $2, period_end = $3 WHERE payment_id = $1
    `, [paymentId, dueDate, addOneCalendarMonth(new Date(`${dueDate}T15:00:00.000Z`))]);
    expect(await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: { ...payment, status: "CONFIRMED" },
    })).toMatchObject({ granted: true, outcome: "confirmed" });
    const corrected = await isolated.pool!.query<{ due_date: Date; period_end: Date }>(
      "SELECT due_date, period_end FROM billing_payment_cycle WHERE payment_id = $1", [paymentId],
    );
    expect(new Date(corrected.rows[0]!.due_date).toISOString().slice(0, 10)).toBe(originalDueDate);
    expect(new Date(corrected.rows[0]!.period_end).getTime())
      .toBe(addOneCalendarMonth(new Date(`${originalDueDate}T15:00:00.000Z`)).getTime());
    expect((await getBillingStatus(userId)).renewalIssue).toBeUndefined();
  });

  it("cancelCardSubscription_afterRenewal_keepsLatestPaidCycle", async () => {
    const { userId, orderId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const initialPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const api = provider({ findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
      checkoutSession, subscriptionId, paymentId: initialPaymentId,
      paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
    })) });
    await reconcileCardSubscription(userId, api);
    await isolated.pool!.query("UPDATE billing_order SET period_end = NOW() - INTERVAL '1 day' WHERE id = $1", [orderId]);
    await isolated.pool!.query("UPDATE billing_payment_cycle SET period_end = NOW() - INTERVAL '1 day' WHERE payment_id = $1", [initialPaymentId]);
    await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_CONFIRMED", account: { id: accountId },
      payment: { id: `pay_${randomUUID().replaceAll("-", "")}`,
        subscription: subscriptionId, billingType: "CREDIT_CARD",
        value: 29.9, dueDate: saoPauloToday(), status: "CONFIRMED" },
    });
    const { getBillingStatus } = await import("./billing");
    const before = await getBillingStatus(userId);
    const after = await cancelCardSubscription(userId, api);
    expect(after.plan).toBe("pro");
    expect(after.paidUntil).toBe(before.paidUntil);
    expect(after.recurringRenewal).toBe("cancelled");
  });

  it("subscriptionDeletedWebhook_confirmsWithoutDeletingCatalogOrDoubleEmail", async () => {
    const { userId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    await reconcileCardSubscription(userId, provider({
      findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
        checkoutSession, subscriptionId, paymentId: `pay_${randomUUID().replaceAll("-", "")}`,
        paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
      })),
    }));
    isolated.email.mockClear();
    const event = { id: randomUUID(), event: "SUBSCRIPTION_DELETED",
      account: { id: accountId }, subscription: { id: subscriptionId } };
    expect(await processSubscriptionWebhook(event)).toMatchObject({ outcome: "confirmed" });
    expect(await processSubscriptionWebhook(event)).toMatchObject({ duplicate: true });
    expect(isolated.email).toHaveBeenCalledOnce();
    const { getBillingStatus } = await import("./billing");
    const status = await getBillingStatus(userId);
    expect(status.plan).toBe("pro");
    expect(status.recurringRenewal).toBe("cancelled");
  });

  it("pixRefund_revokesOnlyTheRefundedMonth", async () => {
    const { userId, orderId, checkoutId } = await actor();
    await isolated.pool!.query("UPDATE billing_order SET method = 'pix' WHERE id = $1", [orderId]);
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const received = { id: randomUUID(), event: "PAYMENT_RECEIVED",
      account: { id: accountId }, payment: { id: paymentId, checkoutSession: checkoutId,
        billingType: "PIX", value: 29.9, status: "RECEIVED", dueDate: saoPauloToday() } };
    expect(await processSubscriptionPaymentWebhook(received)).toMatchObject({ outcome: "confirmed" });
    expect(await processSubscriptionPaymentWebhook({ ...received, id: randomUUID(),
      event: "PAYMENT_REFUNDED", payment: { ...received.payment, checkoutSession: undefined } }))
      .toMatchObject({ outcome: "refunded" });
    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).plan).toBe("free");
    const row = await isolated.pool!.query("SELECT status, initial_payment_id FROM billing_order WHERE id = $1", [orderId]);
    expect(row.rows[0]).toMatchObject({ status: "paid", initial_payment_id: paymentId });
  });

  it("cardRefund_withoutCheckoutSession_reconcilesInitialPaymentBeforeRevoking", async () => {
    const { userId, orderId, checkoutId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    await isolated.pool!.query("UPDATE billing_order SET subscription_id = $2 WHERE id = $1", [orderId, subscriptionId]);
    const api = provider({ findCheckoutPaymentBySession: vi.fn(async () => ({
      checkoutSession: checkoutId, paymentId, subscriptionId,
      paymentStatus: "REFUNDED", billingType: "CREDIT_CARD", value: 29.9,
    })) });
    const refund = { id: randomUUID(), event: "PAYMENT_REFUNDED", account: { id: accountId },
      payment: { id: paymentId, subscription: subscriptionId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday() } };
    expect(await processSubscriptionPaymentWebhook(refund, api)).toMatchObject({ outcome: "refunded" });
    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).plan).toBe("free");
    const row = await isolated.pool!.query("SELECT initial_payment_id FROM billing_order WHERE id = $1", [orderId]);
    expect(row.rows[0].initial_payment_id).toBe(paymentId);
  });

  it("cardRefund_withoutCheckoutOrStoredSubscription_findsExactInitialCheckout", async () => {
    const { userId, orderId, checkoutId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const api = provider({ findInitialPaymentBySubscription: vi.fn(async (id) => id === subscriptionId ? {
      checkoutSession: checkoutId, paymentId, subscriptionId: id,
      paymentStatus: "REFUNDED", billingType: "CREDIT_CARD", value: 29.9,
    } : undefined) });
    await processSubscriptionPaymentWebhook({
      id: randomUUID(), event: "PAYMENT_REFUNDED", account: { id: accountId },
      payment: { id: paymentId, subscription: subscriptionId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday() },
    }, api);
    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).plan).toBe("free");
    const row = await isolated.pool!.query("SELECT subscription_id, initial_payment_id FROM billing_order WHERE id = $1", [orderId]);
    expect(row.rows[0]).toMatchObject({ subscription_id: subscriptionId, initial_payment_id: paymentId });
  });

  it("cardRefund_manyUnlinkedOrders_usesSubscriptionFilterWithoutGlobalBlock", async () => {
    for (let index = 0; index < 21; index += 1) await actor();
    const { userId, checkoutId } = await actor();
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`;
    const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
    const api = provider({ findInitialPaymentBySubscription: vi.fn(async (id) => ({
      checkoutSession: checkoutId, paymentId, subscriptionId: id,
      paymentStatus: "REFUNDED", billingType: "CREDIT_CARD", value: 29.9,
    })) });
    await processSubscriptionPaymentWebhook({ id: randomUUID(), event: "PAYMENT_REFUNDED",
      account: { id: accountId }, payment: { id: paymentId, subscription: subscriptionId,
        billingType: "CREDIT_CARD", value: 29.9, dueDate: saoPauloToday() } }, api);
    const { getBillingStatus } = await import("./billing");
    expect((await getBillingStatus(userId)).plan).toBe("free");
    expect(api.findInitialPaymentBySubscription).toHaveBeenCalledOnce();
    expect(api.findCheckoutPaymentBySession).not.toHaveBeenCalled();
  });
});
