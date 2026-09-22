import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
config({ path: ".env.local", quiet: true });
const isolated = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("./db", () => ({
  getDb: () => {
    if (!isolated.pool) throw new Error("Test database missing");
    return isolated.pool;
  },
}));
import { listSimulations, saveSimulation } from "./simulations";
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const actorA = "sim-test-" + randomUUID();
const actorB = "sim-test-" + randomUUID();
const draft = {
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
};
suite("simulations ownership", () => {
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    if (!url.pathname.endsWith("precopronto_integration"))
      throw new Error("Use the dedicated integration database.");
    isolated.pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await isolated.pool.query(
      `CREATE TABLE IF NOT EXISTS saved_simulation(id text PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,channel text NOT NULL,input jsonb NOT NULL,result jsonb NOT NULL,rule_id text NOT NULL,fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,fingerprint))`,
    );
    for (const id of [actorA, actorB])
      await isolated.pool.query(
        `INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt",terms_accepted,terms_version,privacy_version,marketing_consent) VALUES ($1,'Teste',$2,true,now(),now(),true,'2026-09-22','2026-09-22',false)`,
        [id, id + "@precopronto.test"],
      );
  });
  afterAll(async () => {
    if (isolated.pool) {
      await isolated.pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [
        [actorA, actorB],
      ]);
      await isolated.pool.end();
      isolated.pool = null;
    }
  });
  it("saveSimulation_forgedOwnerAndTotal_recomputesAndIsolates", async () => {
    const saved = await saveSimulation(actorA, {
      ...draft,
      user_id: actorB,
      result: { netProfit: 999 },
    });
    expect(saved.result.netProfit).toBe(20.35);
    expect((await listSimulations(actorA)).map((s) => s.id)).toContain(
      saved.id,
    );
    expect(await listSimulations(actorB)).toEqual([]);
  });
  it("saveSimulation_duplicateRequest_doesNotDuplicate", async () => {
    const values = await Promise.all([
      saveSimulation(actorA, draft),
      saveSimulation(actorA, draft),
    ]);
    expect(values[0].id).toBe(values[1].id);
    expect(await listSimulations(actorA)).toHaveLength(1);
  });
  it("saveSimulation_concurrentQuota_cannotExceedTen", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        saveSimulation(actorB, {
          ...draft,
          input: { ...draft.input, productCost: 100 + i },
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(await listSimulations(actorB)).toHaveLength(10);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
  });
});
