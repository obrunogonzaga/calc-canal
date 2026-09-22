import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  evaluateProductDraft,
  type Product,
  type ProductWriteInput,
} from "@/lib/products";

config({ path: ".env.local", quiet: true });

const isolated = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("./db", () => ({
  getDb: () => {
    if (!isolated.pool) {
      throw new Error("Test database missing");
    }

    return isolated.pool;
  },
}));

import {
  archiveProduct,
  createProduct,
  exportProductsForPortability,
  getEntitlement,
  listProducts,
  selectEditableProducts,
  updateProduct,
} from "./products";

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const createdUsers = new Set<string>();

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
} as const;

function productInput(sku: string, name = `Produto ${sku}`): ProductWriteInput {
  return {
    sku,
    name,
    draft: structuredClone(draft),
    currentPrice: 120,
  };
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

async function grantPro(userId: string): Promise<void> {
  await isolated.pool!.query(
    `
      INSERT INTO account_entitlement (user_id, plan, expires_at)
      VALUES ($1, 'pro', NOW() + INTERVAL '1 day')
      ON CONFLICT (user_id)
      DO UPDATE SET plan = EXCLUDED.plan, expires_at = EXCLUDED.expires_at, updated_at = NOW()
    `,
    [userId],
  );
}

async function insertProFixtures(userId: string, count: number): Promise<void> {
  const evaluation = evaluateProductDraft(structuredClone(draft));

  await isolated.pool!.query(
    `
      INSERT INTO catalog_product (
        id, user_id, sku, name, product_cost, packaging, seller_shipping,
        tax_percent, commission_percent, fixed_fee, desired_margin_percent,
        channel_id, tariff_mode, confirmed_drop_off, current_price,
        evaluated_draft, evaluated_result, rule_version
      )
      SELECT
        'fixture-' || series::text,
        $1,
        'fixture-sku-' || series::text,
        'Produto fixture ' || series::text,
        50, 3, 0, 6, 16, 6, 20,
        'shopee', 'manual', FALSE, 120,
        $2::jsonb, $3::jsonb, $4
      FROM generate_series(1, $5) AS series
    `,
    [
      userId,
      JSON.stringify(evaluation.draft),
      JSON.stringify(evaluation.result),
      evaluation.ruleId,
      count,
    ],
  );
}

suite("products integration", () => {
  beforeAll(async () => {
    const url = testDatabaseUrl();
    isolated.pool = new Pool({ connectionString: url.toString() });
    const migrationSql = await readFile(
      new URL("../../../migrations/0002_products.sql", import.meta.url),
      "utf8",
    );

    await isolated.pool.query(migrationSql);
  });

  afterAll(async () => {
    if (isolated.pool) {
      await isolated.pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
        [...createdUsers],
      ]);
      await isolated.pool.end();
      isolated.pool = null;
    }
  });

  it("createProduct_twoUsers_isolatesOwnership", async () => {
    const actorA = await createActor("products-a");
    const actorB = await createActor("products-b");
    const product = await createProduct(actorA, {
      ...productInput("SKU-A"),
      userId: actorB,
    });

    expect((await listProducts(actorA)).products.map((item) => item.id)).toEqual([
      product.id,
    ]);
    expect((await listProducts(actorB)).products).toEqual([]);
    await expect(
      updateProduct(actorB, product.id, product.version, productInput("SKU-A")),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("createProduct_caseInsensitiveSku_rejectsDuplicate", async () => {
    const actor = await createActor("products-sku");

    await createProduct(actor, productInput("ABC-123"));

    await expect(createProduct(actor, productInput("abc-123"))).rejects.toMatchObject({
      code: "SKU_ALREADY_EXISTS",
    });
  });

  it("createProduct_freeLimit_rejectsSixthActiveProduct", async () => {
    const actor = await createActor("products-free");

    for (let index = 1; index <= 5; index += 1) {
      await createProduct(actor, productInput(`FREE-${index}`));
    }

    expect((await getEntitlement(actor)).count).toBe(5);
    await expect(createProduct(actor, productInput("FREE-6"))).rejects.toMatchObject({
      code: "PRODUCT_LIMIT_REACHED",
    });
  });

  it("createProduct_proLimit_allowsFiveHundredAndRejectsNext", async () => {
    const actor = await createActor("products-pro");
    await grantPro(actor);
    await insertProFixtures(actor, 499);

    const fiveHundredth = await createProduct(actor, productInput("PRO-500"));

    expect(fiveHundredth.sku).toBe("PRO-500");
    expect((await getEntitlement(actor)).count).toBe(500);
    await expect(createProduct(actor, productInput("PRO-501"))).rejects.toMatchObject({
      code: "PRODUCT_LIMIT_REACHED",
    });
  });

  it("updateProduct_concurrentVersions_conflictsAndKeepsSnapshotsImmutable", async () => {
    const actor = await createActor("products-conflict");
    const product = await createProduct(actor, productInput("CONFLICT"));
    const updates = await Promise.allSettled([
      updateProduct(actor, product.id, product.version, productInput("CONFLICT", "A")),
      updateProduct(actor, product.id, product.version, productInput("CONFLICT", "B")),
    ]);

    expect(updates.filter((update) => update.status === "fulfilled")).toHaveLength(1);
    expect(updates.filter((update) => update.status === "rejected")).toHaveLength(1);
    expect(
      updates.find((update) => update.status === "rejected"),
    ).toMatchObject({ reason: { code: "PRODUCT_CONFLICT" } });

    const snapshots = await isolated.pool!.query<{ id: string }>(
      "SELECT id FROM catalog_product_evaluation WHERE product_id = $1 ORDER BY product_version",
      [product.id],
    );

    expect(snapshots.rows).toHaveLength(2);
    await expect(
      isolated.pool!.query(
        "UPDATE catalog_product_evaluation SET rule_version = 'forjada' WHERE id = $1",
        [snapshots.rows[0]!.id],
      ),
    ).rejects.toThrow("immutable");
  });

  it("selectEditableProducts_downgradePreservesDataAndLimitsEdits", async () => {
    const actor = await createActor("products-downgrade");
    await grantPro(actor);
    const products: Product[] = [];

    for (let index = 1; index <= 6; index += 1) {
      products.push(await createProduct(actor, productInput(`DOWN-${index}`)));
    }

    await isolated.pool!.query(
      "UPDATE account_entitlement SET plan = 'free', expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1",
      [actor],
    );

    const beforeSelection = await listProducts(actor);

    expect(beforeSelection.entitlement).toMatchObject({
      plan: "free",
      count: 6,
      requiresSelection: true,
    });
    expect(beforeSelection.products.every((product) => !product.editable)).toBe(true);
    await expect(
      updateProduct(actor, products[0]!.id, products[0]!.version, productInput("DOWN-1")),
    ).rejects.toMatchObject({ code: "PRODUCT_READ_ONLY" });

    const entitlement = await selectEditableProducts(actor, {
      ids: products.slice(0, 5).map((product) => product.id),
    });
    const afterSelection = await listProducts(actor);

    expect(entitlement.selectedEditableCount).toBe(5);
    expect(afterSelection.products.filter((product) => product.editable)).toHaveLength(5);
    expect(
      afterSelection.products.find((product) => product.id === products[5]!.id)
        ?.editable,
    ).toBe(false);
    await expect(
      updateProduct(
        actor,
        products[0]!.id,
        products[0]!.version,
        productInput("DOWN-1", "Produto editável"),
      ),
    ).resolves.toMatchObject({ name: "Produto editável" });
  });

  it("archiveProduct_restoreAndPortability_preservesArchivedRecords", async () => {
    const actor = await createActor("products-archive");
    const first = await createProduct(actor, productInput("ARCHIVE-1"));

    const archived = await archiveProduct(actor, first.id, first.version, true);

    expect(archived.archivedAt).toBeTruthy();
    expect(archived.editable).toBe(false);
    expect((await listProducts(actor)).products).toEqual([]);
    expect((await exportProductsForPortability(actor)).map((product) => product.id)).toContain(
      first.id,
    );

    const restored = await archiveProduct(actor, first.id, archived.version, false);

    expect(restored.archivedAt).toBeUndefined();
    expect(restored.editable).toBe(true);
    expect((await listProducts(actor, { status: "archived" })).products).toEqual([]);
  });

  it("createProduct_invalidValues_rejectsBeforePersistence", async () => {
    const actor = await createActor("products-invalid");
    const invalid = productInput("INVALID");
    invalid.draft.input.productCost = -1;

    await expect(createProduct(actor, invalid)).rejects.toMatchObject({
      code: "INVALID_PRODUCT",
    });
    expect((await listProducts(actor)).products).toEqual([]);
  });
});
