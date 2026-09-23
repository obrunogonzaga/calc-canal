import { createHash } from "node:crypto";

import {
  createAsaasSandboxSubscriptionClient,
  type AsaasSandboxSubscriptionClient,
  type AsaasSubscriptionPaymentRecord,
} from "./asaas-subscription-client";
import { getBillingStatus } from "./billing";
import { getDb } from "./db";
import { processSubscriptionPaymentWebhook } from "./subscription-payment-webhook";

type SupportedEvent = "PAYMENT_CONFIRMED" | "PAYMENT_RECEIVED" | "PAYMENT_OVERDUE" |
  "PAYMENT_REFUNDED" | "PAYMENT_CHARGEBACK_REQUESTED";

interface ReconciliationOrder {
  id: string;
  user_id: string;
  method: "card" | "pix";
  checkout_id: string | null;
  subscription_id: string | null;
  initial_payment_id: string | null;
  amount_cents: number;
  currency: string;
}

interface Candidate {
  payment: AsaasSubscriptionPaymentRecord;
  event: SupportedEvent;
}

export interface BillingReconciliationPreview {
  order: ReconciliationOrder;
  candidates: Candidate[];
  skipped: number;
}

export class BillingReconciliationError extends Error {
  constructor(message: string) { super(message); }
}

function eventForStatus(status: string | undefined): SupportedEvent | undefined {
  const events: Record<string, SupportedEvent> = {
    CONFIRMED: "PAYMENT_CONFIRMED",
    RECEIVED: "PAYMENT_RECEIVED",
    OVERDUE: "PAYMENT_OVERDUE",
    REFUNDED: "PAYMENT_REFUNDED",
    CHARGEBACK_REQUESTED: "PAYMENT_CHARGEBACK_REQUESTED",
  };
  return status ? events[status] : undefined;
}

function validateRecord(record: AsaasSubscriptionPaymentRecord, order: ReconciliationOrder): void {
  const expectedBillingType = order.method === "card" ? "CREDIT_CARD" : "PIX";
  if (!record.paymentId || record.billingType !== expectedBillingType ||
    Math.round((record.value ?? 0) * 100) !== order.amount_cents ||
    (order.method === "card" && record.subscriptionId !== order.subscription_id) ||
    (order.method === "pix" && record.subscriptionId !== undefined) ||
    (record.checkoutSession && record.checkoutSession !== order.checkout_id)) {
    throw new BillingReconciliationError("Cobrança do Asaas não corresponde ao pedido selecionado.");
  }
}

export async function inspectBillingOrderReconciliation(
  orderId: string,
  provider: AsaasSandboxSubscriptionClient = createAsaasSandboxSubscriptionClient(),
): Promise<BillingReconciliationPreview> {
  if (process.env.APP_ENV === "production" || process.env.ASAAS_ENV !== "sandbox") {
    throw new BillingReconciliationError("A conciliação manual está limitada ao Sandbox.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new BillingReconciliationError("Identificador de pedido inválido.");
  }
  const result = await getDb().query<ReconciliationOrder>(`
    SELECT id, user_id, method, checkout_id, subscription_id, initial_payment_id,
      amount_cents, currency
    FROM billing_order WHERE id = $1 AND status = 'paid'
  `, [orderId]);
  const order = result.rows[0];
  if (!order || order.currency !== "BRL" || order.amount_cents !== 2990 ||
    !order.initial_payment_id || !order.checkout_id ||
    (order.method === "card" && !order.subscription_id)) {
    throw new BillingReconciliationError("O pedido ainda não possui vínculo financeiro verificável.");
  }

  const records = order.method === "card"
    ? await provider.listPaymentsForSubscription(order.subscription_id!)
    : [];
  const initial = await provider.getPayment(order.initial_payment_id);
  const unique = new Map<string, AsaasSubscriptionPaymentRecord>();
  for (const record of [...records, initial]) {
    validateRecord(record, order);
    const previous = unique.get(record.paymentId);
    if (previous && (previous.paymentStatus !== record.paymentStatus ||
      previous.originalDueDate !== record.originalDueDate ||
      previous.dueDate !== record.dueDate)) {
      throw new BillingReconciliationError("O Asaas retornou versões contraditórias da mesma cobrança.");
    }
    unique.set(record.paymentId, record);
  }
  const initialRecord = unique.get(order.initial_payment_id);
  if (!initialRecord) throw new BillingReconciliationError("A primeira cobrança não foi encontrada no Asaas.");
  const ordered = [...unique.values()].sort((left, right) => {
    if (left.paymentId === order.initial_payment_id) return -1;
    if (right.paymentId === order.initial_payment_id) return 1;
    return (left.originalDueDate ?? left.dueDate ?? "").localeCompare(
      right.originalDueDate ?? right.dueDate ?? "",
    );
  });
  const candidates: Candidate[] = [];
  let skipped = 0;
  for (const payment of ordered) {
    const event = eventForStatus(payment.paymentStatus);
    if (event) candidates.push({ payment, event });
    else skipped += 1;
  }
  return { order, candidates, skipped };
}

export async function applyBillingOrderReconciliation(
  preview: BillingReconciliationPreview,
): Promise<{ processed: number; duplicates: number; skipped: number; plan: "free" | "pro" }> {
  const accountId = process.env.ASAAS_SANDBOX_ACCOUNT_ID;
  if (process.env.APP_ENV === "production" || process.env.ASAAS_ENV !== "sandbox" || !accountId) {
    throw new BillingReconciliationError("A conciliação manual está limitada ao Sandbox.");
  }
  let processed = 0;
  let duplicates = 0;
  for (const { payment, event } of preview.candidates) {
    const fingerprint = createHash("sha256").update(JSON.stringify({
      event, paymentId: payment.paymentId, value: payment.value,
      dueDate: payment.dueDate, originalDueDate: payment.originalDueDate,
    })).digest("hex").slice(0, 16);
    const eventId = `reconcile:${payment.paymentId}:${fingerprint}`;
    if (eventId.length > 200) throw new BillingReconciliationError("Identificador de cobrança excessivamente longo.");
    const result = await processSubscriptionPaymentWebhook({
      id: eventId,
      event,
      account: { id: accountId },
      payment: {
        id: payment.paymentId,
        subscription: payment.subscriptionId ?? null,
        ...(payment.checkoutSession ? { checkoutSession: payment.checkoutSession } : {}),
        billingType: payment.billingType,
        value: payment.value,
        ...(payment.dueDate ? { dueDate: payment.dueDate } : {}),
        ...(payment.originalDueDate ? { originalDueDate: payment.originalDueDate } : {}),
        ...(payment.invoiceUrl ? { invoiceUrl: payment.invoiceUrl } : {}),
        status: payment.paymentStatus,
      },
    });
    if (result.duplicate) duplicates += 1;
    else processed += 1;
  }
  const status = await getBillingStatus(preview.order.user_id);
  return { processed, duplicates, skipped: preview.skipped, plan: status.plan };
}
