import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AsaasSandboxSubscriptionClient } from "./asaas-subscription-client";
import { AsaasSubscriptionClientError } from "./asaas-subscription-client";

config({ path: ".env.local", quiet: true });

const isolated = vi.hoisted(() => ({ pool: null as Pool | null, email: vi.fn() }));
vi.mock("./db", () => ({ getDb: () => isolated.pool }));
vi.mock("./mailer", () => ({ sendSubscriptionCancellationEmail: isolated.email }));

import { cancelCardSubscription, reconcileCardSubscription, recoverPaidCheckout, verifyCardCancellation } from "./subscription-lifecycle";
import { processSubscriptionPaymentWebhook } from "./subscription-payment-webhook";
import { processSubscriptionWebhook } from "./subscription-payment-webhook";
import { saoPauloToday } from "./billing";

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const users: string[] = [];
const accountId = "sandbox-subscription-test-account";
const priorAccountId = process.env.ASAAS_SANDBOX_ACCOUNT_ID;

function provider(overrides: Partial<AsaasSandboxSubscriptionClient> = {}): AsaasSandboxSubscriptionClient {
  return {
    findSubscriptionByCheckoutSession: vi.fn(async (checkoutSession) => ({
      checkoutSession, subscriptionId: "sub_test_123", paymentId: "pay_test_123",
      paymentStatus: "CONFIRMED", billingType: "CREDIT_CARD", value: 29.9,
    })),
    findCheckoutPaymentBySession: vi.fn(async () => undefined),
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
    await expect(recoverPaidCheckout(userId, api)).rejects.toMatchObject({ code: "RECONCILIATION_INVALID" });
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
});
