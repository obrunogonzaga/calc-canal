import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import {
  evaluateProductDraft,
  validateProductSelection,
  validateProductVersion,
  validateProductWriteInput,
  type Product,
  type ProductEntitlement,
  type ProductEvaluation,
  type ProductListResult,
  type ProductListStatus,
  type ProductPlan,
  type ProductWriteInput,
} from "@/lib/products";
import type { PricingBreakdown } from "@/lib/pricing";
import type { SimulationDraft } from "@/lib/simulation-draft";

import { getDb } from "./db";

const FREE_PRODUCT_LIMIT = 5;
const PRO_PRODUCT_LIMIT = 500;

type ProductErrorCode =
  | "PRODUCT_ARCHIVED"
  | "PRODUCT_CONFLICT"
  | "PRODUCT_LIMIT_REACHED"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_READ_ONLY"
  | "PRODUCT_SELECTION_NOT_REQUIRED"
  | "SKU_ALREADY_EXISTS";

export class ProductServiceError extends Error {
  constructor(
    readonly code: ProductErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface EntitlementRow {
  plan: ProductPlan;
  expires_at: Date | string | null;
}

interface ProductCountRow {
  active_count: string;
  archived_count: string;
  selected_count: string;
}

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  channel_id: Product["channelId"];
  current_price: number | null;
  evaluated_draft: SimulationDraft | string;
  evaluated_result: PricingBreakdown | string;
  rule_version: string;
  version: number;
  free_selected: boolean;
  archived_at: Date | string | null;
  updated_at: Date | string;
}

export interface ProductListOptions {
  search?: string;
  status?: ProductListStatus;
}

function productError(code: ProductErrorCode, message: string): never {
  throw new ProductServiceError(code, message);
}

function isProEntitlement(row: EntitlementRow | undefined): boolean {
  if (row?.plan !== "pro" || !row.expires_at) {
    return false;
  }

  return new Date(row.expires_at).getTime() > Date.now();
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isEditable(
  entitlement: ProductEntitlement,
  product: ProductRow,
): boolean {
  if (product.archived_at) {
    return false;
  }

  return (
    entitlement.plan === "pro" ||
    !entitlement.requiresSelection ||
    product.free_selected
  );
}

function toProduct(
  row: ProductRow,
  entitlement: ProductEntitlement,
): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    channelId: row.channel_id,
    ...(row.current_price === null
      ? {}
      : { currentPrice: Number(row.current_price) }),
    draft: parseJson<SimulationDraft>(row.evaluated_draft),
    result: parseJson<PricingBreakdown>(row.evaluated_result),
    ruleId: row.rule_version,
    version: Number(row.version),
    ...(row.archived_at
      ? { archivedAt: toIsoString(row.archived_at) }
      : {}),
    editable: isEditable(entitlement, row),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function lockUser(client: PoolClient, userId: string): Promise<void> {
  const user = await client.query<{ id: string }>(
    'SELECT id FROM "user" WHERE id = $1 FOR UPDATE',
    [userId],
  );

  if (!user.rows[0]) {
    return productError("PRODUCT_NOT_FOUND", "Conta não encontrada.");
  }
}

async function getEntitlementForClient(
  client: PoolClient,
  userId: string,
): Promise<ProductEntitlement> {
  const [entitlementResult, countResult] = await Promise.all([
    client.query<EntitlementRow>(
      "SELECT plan, expires_at FROM account_entitlement WHERE user_id = $1",
      [userId],
    ),
    client.query<ProductCountRow>(
      `
        SELECT
          COUNT(*) FILTER (WHERE archived_at IS NULL) AS active_count,
          COUNT(*) FILTER (WHERE archived_at IS NOT NULL) AS archived_count,
          COUNT(*) FILTER (
            WHERE archived_at IS NULL AND free_selected = TRUE
          ) AS selected_count
        FROM catalog_product
        WHERE user_id = $1
      `,
      [userId],
    ),
  ]);
  const plan: ProductPlan = isProEntitlement(entitlementResult.rows[0])
    ? "pro"
    : "free";
  const counts = countResult.rows[0] ?? {
    active_count: "0",
    archived_count: "0",
    selected_count: "0",
  };
  const count = Number(counts.active_count);

  return {
    plan,
    limit: plan === "pro" ? PRO_PRODUCT_LIMIT : FREE_PRODUCT_LIMIT,
    count,
    archivedCount: Number(counts.archived_count),
    requiresSelection: plan === "free" && count > FREE_PRODUCT_LIMIT,
    selectedEditableCount: Number(counts.selected_count),
  };
}

async function findProductForUpdate(
  client: PoolClient,
  userId: string,
  productId: string,
): Promise<ProductRow> {
  const result = await client.query<ProductRow>(
    `
      SELECT
        id, sku, name, channel_id, current_price, evaluated_draft,
        evaluated_result, rule_version, version, free_selected,
        archived_at, updated_at
      FROM catalog_product
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
    `,
    [productId, userId],
  );
  const product = result.rows[0];

  if (!product) {
    return productError("PRODUCT_NOT_FOUND", "Produto não encontrado.");
  }

  return product;
}

async function insertEvaluation(
  client: PoolClient,
  productId: string,
  productVersion: number,
  evaluation: ProductEvaluation,
): Promise<void> {
  await client.query(
    `
      INSERT INTO catalog_product_evaluation (
        id, product_id, product_version, evaluated_draft, evaluated_input,
        evaluated_result, rule_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      randomUUID(),
      productId,
      productVersion,
      JSON.stringify(evaluation.draft),
      JSON.stringify(evaluation.draft.input),
      JSON.stringify(evaluation.result),
      evaluation.ruleId,
    ],
  );
}

function productValues(
  write: ProductWriteInput,
  evaluation: ProductEvaluation,
): readonly unknown[] {
  const input = evaluation.draft.input;

  return [
    write.sku,
    write.name,
    input.productCost,
    input.packaging,
    input.sellerShipping,
    input.taxPercent,
    input.commissionPercent,
    input.fixedFee,
    input.desiredMarginPercent,
    evaluation.draft.channelId,
    evaluation.draft.tariffMode,
    evaluation.draft.confirmedDropOff,
    write.currentPrice ?? null,
    JSON.stringify(evaluation.draft),
    JSON.stringify(evaluation.result),
    evaluation.ruleId,
  ];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function withTransaction<T>(
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDb().connect();

  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getEntitlement(
  userId: string,
): Promise<ProductEntitlement> {
  const client = await getDb().connect();

  try {
    return await getEntitlementForClient(client, userId);
  } finally {
    client.release();
  }
}

export async function listProducts(
  userId: string,
  options: ProductListOptions = {},
): Promise<ProductListResult> {
  const client = await getDb().connect();

  try {
    const entitlement = await getEntitlementForClient(client, userId);
    const values: unknown[] = [userId];
    const conditions = ["user_id = $1"];

    if (options.status === "archived") {
      conditions.push("archived_at IS NOT NULL");
    } else if (options.status !== "all") {
      conditions.push("archived_at IS NULL");
    }

    if (options.search) {
      values.push(`%${options.search}%`);
      conditions.push(`(sku ILIKE $${values.length} OR name ILIKE $${values.length})`);
    }

    const result = await client.query<ProductRow>(
      `
        SELECT
          id, sku, name, channel_id, current_price, evaluated_draft,
          evaluated_result, rule_version, version, free_selected,
          archived_at, updated_at
        FROM catalog_product
        WHERE ${conditions.join(" AND ")}
        ORDER BY archived_at IS NULL DESC, updated_at DESC, id ASC
      `,
      values,
    );

    return {
      products: result.rows.map((product) => toProduct(product, entitlement)),
      entitlement,
    };
  } finally {
    client.release();
  }
}

export async function exportProductsForPortability(
  userId: string,
): Promise<Product[]> {
  const { products } = await listProducts(userId, { status: "all" });

  return products;
}

export async function createProduct(
  userId: string,
  value: unknown,
): Promise<Product> {
  const write = validateProductWriteInput(value);
  const evaluation = evaluateProductDraft(write.draft);

  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const entitlement = await getEntitlementForClient(client, userId);

    if (entitlement.count >= entitlement.limit) {
      return productError(
        "PRODUCT_LIMIT_REACHED",
        "Você atingiu o limite de produtos ativos do seu plano.",
      );
    }

    const id = randomUUID();
    let inserted: ProductRow;

    try {
      const result = await client.query<ProductRow>(
        `
          INSERT INTO catalog_product (
            id, user_id, sku, name, product_cost, packaging, seller_shipping,
            tax_percent, commission_percent, fixed_fee, desired_margin_percent,
            channel_id, tariff_mode, confirmed_drop_off, current_price,
            evaluated_draft, evaluated_result, rule_version
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18
          )
          RETURNING
            id, sku, name, channel_id, current_price, evaluated_draft,
            evaluated_result, rule_version, version, free_selected,
            archived_at, updated_at
        `,
        [id, userId, ...productValues(write, evaluation)],
      );
      inserted = result.rows[0]!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return productError(
          "SKU_ALREADY_EXISTS",
          "Já existe um produto com esse SKU nesta conta.",
        );
      }

      throw error;
    }

    await insertEvaluation(client, id, inserted.version, evaluation);

    return toProduct(
      inserted,
      {
        ...entitlement,
        count: entitlement.count + 1,
      },
    );
  });
}

export async function updateProduct(
  userId: string,
  productId: string,
  expectedVersion: number,
  value: unknown,
): Promise<Product> {
  const version = validateProductVersion(expectedVersion);
  const write = validateProductWriteInput(value);
  const evaluation = evaluateProductDraft(write.draft);

  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const existing = await findProductForUpdate(client, userId, productId);

    if (existing.version !== version) {
      return productError(
        "PRODUCT_CONFLICT",
        "Este produto foi alterado em outra aba. Atualize antes de salvar.",
      );
    }

    if (existing.archived_at) {
      return productError(
        "PRODUCT_ARCHIVED",
        "Restaure o produto antes de editar.",
      );
    }

    const entitlement = await getEntitlementForClient(client, userId);

    if (!isEditable(entitlement, existing)) {
      return productError(
        "PRODUCT_READ_ONLY",
        "Selecione este produto entre os cinco editáveis para alterá-lo.",
      );
    }

    const nextVersion = existing.version + 1;
    let updated: ProductRow;

    try {
      const result = await client.query<ProductRow>(
        `
          UPDATE catalog_product
          SET
            sku = $3,
            name = $4,
            product_cost = $5,
            packaging = $6,
            seller_shipping = $7,
            tax_percent = $8,
            commission_percent = $9,
            fixed_fee = $10,
            desired_margin_percent = $11,
            channel_id = $12,
            tariff_mode = $13,
            confirmed_drop_off = $14,
            current_price = $15,
            evaluated_draft = $16,
            evaluated_result = $17,
            rule_version = $18,
            version = $19,
            updated_at = NOW()
          WHERE id = $1 AND user_id = $2
          RETURNING
            id, sku, name, channel_id, current_price, evaluated_draft,
            evaluated_result, rule_version, version, free_selected,
            archived_at, updated_at
        `,
        [productId, userId, ...productValues(write, evaluation), nextVersion],
      );
      updated = result.rows[0]!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return productError(
          "SKU_ALREADY_EXISTS",
          "Já existe um produto com esse SKU nesta conta.",
        );
      }

      throw error;
    }

    await insertEvaluation(client, productId, nextVersion, evaluation);

    return toProduct(updated, entitlement);
  });
}

export async function archiveProduct(
  userId: string,
  productId: string,
  expectedVersion: number,
  archived: boolean,
): Promise<Product> {
  const version = validateProductVersion(expectedVersion);

  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const existing = await findProductForUpdate(client, userId, productId);

    if (existing.version !== version) {
      return productError(
        "PRODUCT_CONFLICT",
        "Este produto foi alterado em outra aba. Atualize antes de continuar.",
      );
    }

    const isArchived = Boolean(existing.archived_at);

    if (isArchived === archived) {
      const entitlement = await getEntitlementForClient(client, userId);
      return toProduct(existing, entitlement);
    }

    const entitlement = await getEntitlementForClient(client, userId);

    if (!archived && entitlement.count >= entitlement.limit) {
      return productError(
        "PRODUCT_LIMIT_REACHED",
        "Arquive outro produto antes de restaurar este item.",
      );
    }

    const result = await client.query<ProductRow>(
      `
        UPDATE catalog_product
        SET
          archived_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
          free_selected = CASE WHEN $3 THEN FALSE ELSE free_selected END,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING
          id, sku, name, channel_id, current_price, evaluated_draft,
          evaluated_result, rule_version, version, free_selected,
          archived_at, updated_at
      `,
      [productId, userId, archived],
    );
    const updated = result.rows[0]!;
    const nextEntitlement = {
      ...entitlement,
      count: entitlement.count + (archived ? -1 : 1),
      archivedCount: entitlement.archivedCount + (archived ? 1 : -1),
    };

    return toProduct(updated, nextEntitlement);
  });
}

export async function selectEditableProducts(
  userId: string,
  value: unknown,
): Promise<ProductEntitlement> {
  const productIds = validateProductSelection(value);

  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const entitlement = await getEntitlementForClient(client, userId);

    if (entitlement.plan !== "free" || !entitlement.requiresSelection) {
      return productError(
        "PRODUCT_SELECTION_NOT_REQUIRED",
        "A seleção de produtos editáveis não é necessária neste plano.",
      );
    }

    const selected = await client.query<{ id: string }>(
      `
        SELECT id
        FROM catalog_product
        WHERE user_id = $1
          AND archived_at IS NULL
          AND id = ANY($2::text[])
        FOR UPDATE
      `,
      [userId, productIds],
    );

    if (selected.rows.length !== productIds.length) {
      return productError("PRODUCT_NOT_FOUND", "Produto não encontrado.");
    }

    await client.query(
      `
        UPDATE catalog_product
        SET free_selected = FALSE, updated_at = NOW()
        WHERE user_id = $1 AND archived_at IS NULL
      `,
      [userId],
    );

    if (productIds.length > 0) {
      await client.query(
        `
          UPDATE catalog_product
          SET free_selected = TRUE, updated_at = NOW()
          WHERE user_id = $1 AND id = ANY($2::text[])
        `,
        [userId, productIds],
      );
    }

    return getEntitlementForClient(client, userId);
  });
}
