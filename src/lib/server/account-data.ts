import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getDb } from "./db";

export class AccountDataError extends Error {
  constructor(readonly code: "ACCOUNT_NOT_FOUND" | "RENEWAL_ACTIVE" | "CANCELLATION_PENDING" | "CHECKOUT_OPEN", message: string) {
    super(message);
  }
}

export interface DeletionRequest {
  id: string;
  status: "pending_review" | "completed";
  requestedAt: string;
}

async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function exportAccountData(userId: string) {
  return transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const account = await client.query(`
      SELECT id, name, email, "emailVerified" AS "emailVerified", "createdAt" AS "createdAt",
        terms_accepted AS "termsAccepted", terms_version AS "termsVersion",
        privacy_version AS "privacyVersion", marketing_consent AS "marketingConsent"
      FROM "user" WHERE id = $1
    `, [userId]);
    if (!account.rows[0]) throw new AccountDataError("ACCOUNT_NOT_FOUND", "Conta não encontrada.");
    const simulations = await client.query(`
      SELECT id, channel, input, result, rule_id AS "ruleId", created_at AS "createdAt"
      FROM saved_simulation WHERE user_id = $1 ORDER BY created_at, id
    `, [userId]);
    const products = await client.query(`
      SELECT id, sku, name, channel_id AS "channelId", current_price AS "currentPrice",
        evaluated_draft AS draft, evaluated_result AS result, rule_version AS "ruleVersion",
        version, free_selected AS "freeSelected", archived_at AS "archivedAt",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM catalog_product WHERE user_id = $1 ORDER BY created_at, id
    `, [userId]);
    const orders = await client.query(`
      SELECT id, method, amount_cents AS "amountCents", currency, status,
        period_start AS "periodStart", period_end AS "periodEnd",
        cancellation_state AS "cancellationState", created_at AS "createdAt", paid_at AS "paidAt"
      FROM billing_order WHERE user_id = $1 ORDER BY created_at, id
    `, [userId]);
    const paymentCycles = await client.query(`
      SELECT order_id AS "orderId", due_date AS "dueDate", period_end AS "periodEnd",
        state, is_initial AS "isInitial", updated_at AS "updatedAt"
      FROM billing_payment_cycle WHERE user_id = $1 ORDER BY period_end, order_id
    `, [userId]);
    const deletion = await client.query(`
      SELECT id, status, requested_at AS "requestedAt" FROM account_deletion_request WHERE user_id = $1
    `, [userId]);
    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      account: account.rows[0],
      simulations: simulations.rows,
      products: products.rows,
      orders: orders.rows,
      paymentCycles: paymentCycles.rows,
      deletionRequest: deletion.rows[0] ?? null,
    };
  });
}

export async function getDeletionRequest(userId: string): Promise<DeletionRequest | null> {
  const result = await getDb().query<DeletionRequest>(`
    SELECT id, status, requested_at AS "requestedAt"
    FROM account_deletion_request WHERE user_id = $1
  `, [userId]);
  return result.rows[0] ?? null;
}

export async function requestAccountDeletion(userId: string): Promise<DeletionRequest> {
  return transaction(async (client) => {
    const owner = await client.query('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [userId]);
    if (!owner.rows[0]) throw new AccountDataError("ACCOUNT_NOT_FOUND", "Conta não encontrada.");
    const existing = await client.query<DeletionRequest>(`
      SELECT id, status, requested_at AS "requestedAt" FROM account_deletion_request WHERE user_id = $1
    `, [userId]);
    if (existing.rows[0]) return existing.rows[0];

    const recurring = await client.query<{ cancellation_state: string }>(`
      SELECT cancellation_state FROM billing_order
      WHERE user_id = $1 AND method = 'card' AND status = 'paid'
        AND cancellation_state <> 'confirmed' LIMIT 1
    `, [userId]);
    if (recurring.rows[0]?.cancellation_state === "not_requested") {
      throw new AccountDataError("RENEWAL_ACTIVE", "Cancele a renovação do cartão em Plano antes de pedir a exclusão.");
    }
    if (recurring.rows[0]) {
      throw new AccountDataError("CANCELLATION_PENDING", "Aguarde a confirmação do cancelamento da renovação em Plano.");
    }
    const checkout = await client.query(`
      SELECT id FROM billing_order WHERE user_id = $1 AND status IN ('creating', 'checkout_created') LIMIT 1
    `, [userId]);
    if (checkout.rows[0]) {
      throw new AccountDataError("CHECKOUT_OPEN", "Há um checkout em aberto. Conclua ou aguarde seu encerramento antes de pedir a exclusão.");
    }
    const created = await client.query<DeletionRequest>(`
      INSERT INTO account_deletion_request (id, user_id) VALUES ($1, $2)
      RETURNING id, status, requested_at AS "requestedAt"
    `, [randomUUID(), userId]);
    return created.rows[0]!;
  });
}
