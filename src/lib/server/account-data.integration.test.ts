import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local", quiet: true });
const isolated = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("./db", () => ({ getDb: () => {
  if (!isolated.pool) throw new Error("Test database missing");
  return isolated.pool;
} }));
import { exportAccountData, getDeletionRequest, requestAccountDeletion } from "./account-data";
import { createProduct } from "./products";

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const users: string[] = [];

function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("Test database missing");
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/precopronto_integration") {
    throw new Error("Use the dedicated loopback integration database.");
  }
  return raw;
}

async function actor(): Promise<string> {
  const id = randomUUID();
  users.push(id);
  await isolated.pool!.query(`
    INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt",
      terms_accepted, terms_version, privacy_version, marketing_consent)
    VALUES ($1, 'Teste', $2, TRUE, NOW(), NOW(), TRUE, '2026-09-24', '2026-09-24', FALSE)
  `, [id, `${id}@precopronto.test`]);
  return id;
}

async function order(userId: string, status: "paid" | "checkout_created", cancellation = "not_requested") {
  const id = randomUUID();
  await isolated.pool!.query(`
    INSERT INTO billing_order (id, user_id, external_reference, method, amount_cents, currency,
      status, checkout_expires_at, cancellation_state)
    VALUES ($1, $2, $3, 'card', 2990, 'BRL', $4, NOW() + INTERVAL '1 day', $5)
  `, [id, userId, id, status, cancellation]);
  return id;
}

suite("account data integration", () => {
  beforeAll(async () => {
    isolated.pool = new Pool({ connectionString: testDatabaseUrl() });
    const sql = await readFile(new URL("../../../migrations/0009_account_data_requests.sql", import.meta.url), "utf8");
    await isolated.pool.query(sql);
  });

  afterAll(async () => {
    if (isolated.pool) {
      await isolated.pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [users]);
      await isolated.pool.end();
    }
    isolated.pool = null;
  });

  it("exportAccountData_freeUsers_isolatesAccounts", async () => {
    const first = await actor();
    const second = await actor();
    await isolated.pool!.query(`
      INSERT INTO saved_simulation (id, user_id, channel, input, result, rule_id, fingerprint)
      VALUES ($1, $2, 'shopee', '{}'::jsonb, '{}'::jsonb, 'manual-v1', $3)
    `, [randomUUID(), first, randomUUID()]);
    await createProduct(first, {
      sku: "FREE-14",
      name: "Produto de teste",
      draft: {
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
      },
      currentPrice: 120,
    });
    const firstExport = await exportAccountData(first);
    const secondExport = await exportAccountData(second);
    expect(firstExport.account.id).toBe(first);
    expect(firstExport.simulations).toHaveLength(1);
    expect(firstExport.products).toHaveLength(1);
    expect(secondExport.simulations).toHaveLength(0);
    expect(secondExport.products).toHaveLength(0);
    expect(JSON.stringify(secondExport)).not.toContain(first);
  });

  it("requestAccountDeletion_activeRenewal_rejectsWithoutRequest", async () => {
    const user = await actor();
    await order(user, "paid");
    await expect(requestAccountDeletion(user)).rejects.toMatchObject({ code: "RENEWAL_ACTIVE" });
    expect(await getDeletionRequest(user)).toBeNull();
  });

  it("requestAccountDeletion_unknownCancellation_rejectsWithoutRequest", async () => {
    const user = await actor();
    await order(user, "paid", "unknown");
    await expect(requestAccountDeletion(user)).rejects.toMatchObject({ code: "CANCELLATION_PENDING" });
    expect(await getDeletionRequest(user)).toBeNull();
  });

  it("requestAccountDeletion_openCheckout_rejectsWithoutRequest", async () => {
    const user = await actor();
    await order(user, "checkout_created");
    await expect(requestAccountDeletion(user)).rejects.toMatchObject({ code: "CHECKOUT_OPEN" });
    expect(await getDeletionRequest(user)).toBeNull();
  });

  it("requestAccountDeletion_confirmedCancellation_returnsStableProtocol", async () => {
    const first = await actor();
    const second = await actor();
    await order(first, "paid", "confirmed");
    const request = await requestAccountDeletion(first);
    expect(request.status).toBe("pending_review");
    expect((await requestAccountDeletion(first)).id).toBe(request.id);
    expect(await getDeletionRequest(second)).toBeNull();
    expect((await exportAccountData(first)).deletionRequest.id).toBe(request.id);
  });
});
