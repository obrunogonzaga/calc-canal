import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { report } from "../../../scripts/operations-report";

config({ path: ".env.local", quiet: true });
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

suite("operations", () => {
  let pool: Pool;
  const owner = randomUUID();
  const other = randomUUID();
  const order = randomUUID();
  const payment = `pay-${randomUUID()}`;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/precopronto_integration") throw new Error("Banco de teste isolado obrigatório.");
    pool = new Pool({ connectionString: url.toString() });
    const migration = await readFile(new URL("../../../migrations/0010_operations.sql", import.meta.url), "utf8");
    await pool.query(migration);
    for (const id of [owner, other]) {
      await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt",
        terms_accepted, terms_version, privacy_version, marketing_consent)
        VALUES ($1, 'Teste', $2, TRUE, NOW(), NOW(), TRUE, 'test', 'test', FALSE)`,
      [id, `${id}@precopronto.test`]);
    }
    await pool.query(`INSERT INTO billing_order
      (id, user_id, external_reference, method, amount_cents, currency, status, checkout_expires_at, paid_at)
      VALUES ($1, $2, $3, 'pix', 2990, 'BRL', 'paid', NOW(), NOW())`,
    [order, owner, `billing-order:${order}`]);
    await pool.query(`INSERT INTO billing_payment_cycle
      (payment_id, order_id, user_id, period_end, state, is_initial)
      VALUES ($1, $2, $3, NOW() + INTERVAL '1 month', 'confirmed', TRUE)`,
    [payment, order, owner]);
    await pool.query(`INSERT INTO billing_payment_event (event_id, payment_id, event_type, outcome)
      VALUES ($1, $2, 'PAYMENT_RECEIVED', 'confirmed')`, [`event-${randomUUID()}`, payment]);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM billing_order WHERE id = $1", [order]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::TEXT[])', [[owner, other]]);
    await pool.query("DELETE FROM access_change_audit WHERE user_id = ANY($1::TEXT[])", [[owner, other]]);
    await pool.end();
  });

  it("report_owner_isolated_and_payment_deduplicated", async () => {
    const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await pool.query(`INSERT INTO billing_payment_event (event_id, payment_id, event_type, outcome)
      VALUES ($1, $2, 'PAYMENT_RECEIVED', 'confirmed')`, [`event-${randomUUID()}`, payment]);
    const own = await report(pool, since, owner);
    const foreign = await report(pool, since, other);
    expect(own.financial).toEqual([expect.objectContaining({
      stream: "pix_manual", gross_cycles: 1, gross_confirmed_cents: "2990", received_cycles: 1,
    })]);
    expect(foreign.financial).toEqual([]);
    expect(foreign.account).toMatchObject({ id: other, confirmed_cycles: 0 });
    expect(own.events).toContainEqual({ event_type: "signup_verified", count: 1 });
    expect(foreign.events).toContainEqual({ event_type: "signup_verified", count: 1 });
  });

  it("operator_change_records_actor_reason_and_expiry", async () => {
    const expires = new Date(Date.now() + 86_400_000);
    await pool.query("SELECT set_operator_entitlement($1, 'pro', $2, $3, $4)",
      [owner, expires, "operator-test", "verified test correction"]);
    const audit = await pool.query(`SELECT actor, reason, new_plan, new_expires_at
      FROM access_change_audit WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [owner]);
    expect(audit.rows[0]).toMatchObject({ actor: "operator-test", reason: "verified test correction", new_plan: "pro" });
    expect(new Date(audit.rows[0].new_expires_at).getTime()).toBe(expires.getTime());
    await expect(pool.query("SELECT set_operator_entitlement($1, 'pro', NULL, $2, $3)",
      [owner, "operator-test", "invalid no expiry"])).rejects.toThrow();
  });
});
