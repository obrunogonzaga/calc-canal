import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ProductWriteInput } from "@/lib/products";

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
  confirmCatalogImport,
  createCatalogImportPreview,
} from "./catalog-import";
import { createProduct, updateProduct } from "./products";

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const createdUsers = new Set<string>();

const defaults = {
  channelId: "shopee",
  commissionPercent: 16,
  taxPercent: 6,
  fixedFee: 6,
  packaging: 3,
  sellerShipping: 0,
  desiredMarginPercent: 20,
};

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

async function createActor(prefix: string, pro = true): Promise<string> {
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

  if (pro) {
    await isolated.pool!.query(
      "INSERT INTO account_entitlement (user_id, plan, expires_at) VALUES ($1, 'pro', NOW() + INTERVAL '1 day')",
      [id],
    );
  }

  return id;
}

function importRequest(csv: string, updateExisting = false) {
  return { csv, defaults, updateExisting };
}

function productInput(sku: string, name = `Produto ${sku}`): ProductWriteInput {
  return {
    sku,
    name,
    currentPrice: 99.9,
    draft: {
      version: 1,
      channelId: "shopee",
      tariffMode: "manual",
      confirmedDropOff: false,
      excludeTax: false,
      input: {
        productCost: 10,
        packaging: 3,
        sellerShipping: 0,
        desiredMarginPercent: 20,
        commissionPercent: 16,
        taxPercent: 6,
        fixedFee: 6,
        mode: "margin_to_price",
      },
    },
  };
}

async function activeProductCount(userId: string): Promise<number> {
  const result = await isolated.pool!.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM catalog_product WHERE user_id = $1 AND archived_at IS NULL",
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function insertProductFixtures(userId: string, count: number): Promise<void> {
  const draft = productInput("fixture").draft;
  const result = {
    productCost: 10,
    packaging: 3,
    sellerShipping: 0,
    fixedFee: 6,
    commission: 4,
    tax: 1,
    netProfit: 2,
    profitPercent: 10,
    suggestedPrice: 40,
  };

  await isolated.pool!.query(
    `
      INSERT INTO catalog_product (
        id, user_id, sku, name, product_cost, packaging, seller_shipping,
        tax_percent, commission_percent, fixed_fee, desired_margin_percent,
        channel_id, tariff_mode, confirmed_drop_off, evaluated_draft,
        evaluated_result, rule_version
      )
      SELECT
        'import-fixture-' || $1 || '-' || series::text,
        $1,
        'fixture-sku-' || series::text,
        'Produto fixture ' || series::text,
        10, 3, 0, 6, 16, 6, 20,
        'shopee', 'manual', FALSE, $2::jsonb, $3::jsonb, 'manual-v1'
      FROM generate_series(1, $4) AS series
    `,
    [userId, JSON.stringify(draft), JSON.stringify(result), count],
  );
}

suite("catalog import integration", () => {
  beforeAll(async () => {
    const url = testDatabaseUrl();
    isolated.pool = new Pool({ connectionString: url.toString() });
    const [productsSql, importSql] = await Promise.all([
      readFile(new URL("../../../migrations/0002_products.sql", import.meta.url), "utf8"),
      readFile(new URL("../../../migrations/0003_catalog_import.sql", import.meta.url), "utf8"),
    ]);

    await isolated.pool.query(productsSql);
    await isolated.pool.query(importSql);
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

  it("createCatalogImportPreview_formatAndQuantity_informsWithoutChangingPrice", async () => {
    const actor = await createActor("import-format");
    const preview = await createCatalogImportPreview(
      actor,
      importRequest(
        "SKU;PRODUTO;CUSTO;QTDE;MARGEM\nA;Item A;10,00;1;25\nB;Item B;10,00;99;25",
      ),
    );

    expect(preview).toMatchObject({ validCount: 2, invalidCount: 0 });
    expect(preview.rows.map((row) => row.action)).toEqual(["create", "create"]);
    expect(preview.rows[0]?.newPrice).toBe(preview.rows[1]?.newPrice);
    expect(preview.rows[1]?.quantity).toBe(99);
  });

  it("createCatalogImportPreview_freePlan_rejectsCsvBeforePersistingPreview", async () => {
    const actor = await createActor("import-free", false);

    await expect(
      createCatalogImportPreview(
        actor,
        importRequest("SKU;PRODUTO;CUSTO\nFREE;Sem PRO;10"),
      ),
    ).rejects.toMatchObject({ code: "IMPORT_PRO_REQUIRED" });
  });

  it("createCatalogImportPreview_headerOnlyCsv_rejectsEmptyPreview", async () => {
    const actor = await createActor("import-empty");

    await expect(
      createCatalogImportPreview(actor, importRequest("SKU;PRODUTO;CUSTO\n")),
    ).rejects.toMatchObject({ code: "INVALID_PRODUCT" });
  });

  it.each([
    ["produto;preço\nItem;10", "Cabeçalho obrigatório"],
    ['SKU;PRODUTO;CUSTO\nA;"Sem fechamento;10', "Aspas sem fechamento"],
    ["a".repeat(2_000_001), "2 MB"],
  ])("createCatalogImportPreview_invalidCsv_returnsCorrectableError", async (csv, message) => {
    const actor = await createActor("import-invalid");
    await expect(createCatalogImportPreview(actor, importRequest(csv))).rejects.toMatchObject({
      code: "INVALID_PRODUCT",
      message: expect.stringContaining(message),
    });
  });

  it("createCatalogImportPreview_duplicateExisting_requiresExplicitUpdate", async () => {
    const actor = await createActor("import-duplicate");
    await createProduct(actor, productInput("SKU-EXISTENTE"));

    const blocked = await createCatalogImportPreview(
      actor,
      importRequest("SKU;PRODUTO;CUSTO\nsku-existente;Novo nome;20", false),
    );
    const update = await createCatalogImportPreview(
      actor,
      importRequest("SKU;PRODUTO;CUSTO\nsku-existente;Novo nome;20", true),
    );

    expect(blocked.rows[0]).toMatchObject({ action: "invalid" });
    expect(blocked.rows[0]?.errors.join(" ")).toContain("já existe");
    expect(update.rows[0]).toMatchObject({ action: "update" });
  });

  it("confirmCatalogImport_ownerIsolation_rejectsOtherUserPreview", async () => {
    const owner = await createActor("import-owner");
    const otherUser = await createActor("import-other");
    const preview = await createCatalogImportPreview(
      owner,
      importRequest("SKU;PRODUTO;CUSTO\nISO;Isolado;10"),
    );

    await expect(
      confirmCatalogImport(otherUser, { previewId: preview.previewId, allowPartial: true }),
    ).rejects.toMatchObject({
      code: "IMPORT_PREVIEW_NOT_FOUND",
    });
  });

  it("createCatalogImportPreview_proLimit_marksExcessRowsInvalid", async () => {
    const actor = await createActor("import-limit");
    await insertProductFixtures(actor, 500);

    const preview = await createCatalogImportPreview(
      actor,
      importRequest("SKU;PRODUTO;CUSTO\nLIMIT-501;Excesso;10"),
    );

    expect(preview.rows[0]).toMatchObject({ action: "invalid" });
    expect(preview.rows[0]?.errors.join(" ")).toContain("500");
  });

  it("confirmCatalogImport_retry_returnsStoredResultWithoutDuplicates", async () => {
    const actor = await createActor("import-retry");
    const preview = await createCatalogImportPreview(
      actor,
      importRequest("SKU;PRODUTO;CUSTO\nRETRY;Repetição;10"),
    );

    const first = await confirmCatalogImport(actor, {
      previewId: preview.previewId,
      allowPartial: false,
    });
    const retry = await confirmCatalogImport(actor, {
      previewId: preview.previewId,
      allowPartial: true,
    });

    expect(first).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] });
    expect(retry).toEqual(first);
    expect(await activeProductCount(actor)).toBe(1);
  });

  it("confirmCatalogImport_expiredPreview_rejectsWithoutWritingProducts", async () => {
    const actor = await createActor("import-expired");
    const preview = await createCatalogImportPreview(
      actor,
      importRequest("SKU;PRODUTO;CUSTO\nEXPIRA;Temporário;10"),
    );

    await isolated.pool!.query(
      "UPDATE catalog_import_preview SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
      [preview.previewId],
    );

    await expect(
      confirmCatalogImport(actor, {
        previewId: preview.previewId,
        allowPartial: true,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_PREVIEW_EXPIRED" });
    expect(await activeProductCount(actor)).toBe(0);
  });

  it("confirmCatalogImport_versionConflict_rollsBackWithoutPartialChoice", async () => {
    const actor = await createActor("import-conflict");
    const existing = await createProduct(actor, productInput("CONFLICT"));
    const preview = await createCatalogImportPreview(
      actor,
      importRequest("SKU;PRODUTO;CUSTO\nCONFLICT;Novo nome;20", true),
    );

    await updateProduct(actor, existing.id, existing.version, productInput("CONFLICT", "Outra aba"));

    await expect(
      confirmCatalogImport(actor, {
        previewId: preview.previewId,
        allowPartial: false,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });

    expect(await activeProductCount(actor)).toBe(1);
  });

  it("confirmCatalogImport_existingUpdate_preservesPublishedCurrentPrice", async () => {
    const actor = await createActor("import-current-price");
    const existing = await createProduct(actor, productInput("PRECO"));
    const preview = await createCatalogImportPreview(
      actor,
      importRequest("SKU;PRODUTO;CUSTO\nPRECO;Custo atualizado;20", true),
    );

    const confirmation = await confirmCatalogImport(actor, {
      previewId: preview.previewId,
      allowPartial: false,
    });
    const currentPrice = await isolated.pool!.query<{ current_price: number }>(
      "SELECT current_price FROM catalog_product WHERE id = $1",
      [existing.id],
    );

    expect(confirmation).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect(currentPrice.rows[0]?.current_price).toBe(99.9);
  });

  it("confirmCatalogImport_partialSavepoint_continuesAfterRuntimeConflict", async () => {
    const actor = await createActor("import-savepoint");
    const existing = await createProduct(actor, productInput("EXISTENTE"));
    const preview = await createCatalogImportPreview(
      actor,
      importRequest(
        "SKU;PRODUTO;CUSTO\nEXISTENTE;Atualizado;20\nNOVO;Continua;15",
        true,
      ),
    );

    await updateProduct(
      actor,
      existing.id,
      existing.version,
      productInput("EXISTENTE", "Outra aba"),
    );

    const partial = await confirmCatalogImport(actor, {
      previewId: preview.previewId,
      allowPartial: true,
    });
    expect(partial).toMatchObject({ created: 1, updated: 0, skipped: 1 });
    expect(partial.errors[0]?.line).toBe(2);
    expect(await activeProductCount(actor)).toBe(2);
  });

  it("confirmCatalogImport_partialMode_skipsInvalidAndPersistsValidRows", async () => {
    const actor = await createActor("import-partial");
    const preview = await createCatalogImportPreview(
      actor,
      importRequest("SKU;PRODUTO;CUSTO\nVALIDO;Válido;10\n;Sem SKU;20"),
    );

    await expect(
      confirmCatalogImport(actor, {
        previewId: preview.previewId,
        allowPartial: false,
      }),
    ).rejects.toMatchObject({
      code: "IMPORT_CONFIRMATION_BLOCKED",
    });

    const result = await confirmCatalogImport(actor, {
      previewId: preview.previewId,
      allowPartial: true,
    });

    expect(result).toMatchObject({ created: 1, skipped: 1 });
    expect(await activeProductCount(actor)).toBe(1);
  });
});
