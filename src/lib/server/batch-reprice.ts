import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import {
  ProductValidationError,
  evaluateProductDraft,
  validateProductWriteInput,
  type ProductEvaluation,
  type ProductWriteInput,
} from "@/lib/products";
import { calculatePricing, type PricingBreakdown } from "@/lib/pricing";
import type { SimulationDraft } from "@/lib/simulation-draft";
import type { TariffMode } from "@/lib/tariffs";

import { getDb } from "./db";

const BATCH_PREVIEW_TTL_MS = 15 * 60 * 1000;
const MAX_BATCH_PRODUCTS = 500;

type BatchErrorCode =
  | "BATCH_CONFIRMATION_BLOCKED"
  | "BATCH_CONFLICT"
  | "BATCH_PREVIEW_EXPIRED"
  | "BATCH_PREVIEW_NOT_FOUND"
  | "BATCH_PRO_REQUIRED";

export class BatchRepriceError extends Error {
  constructor(
    readonly code: BatchErrorCode,
    message: string,
    readonly details?: BatchRepriceErrorDetail[],
  ) {
    super(message);
  }
}

export interface BatchRepriceChanges {
  costAdjustmentPercent?: number;
  desiredMarginPercent?: number;
  commissionPercent?: number;
  taxPercent?: number;
  fixedFee?: number;
  tariffMode?: TariffMode;
  confirmedDropOff?: boolean;
}

export interface BatchRepricePreviewRow {
  id: string;
  sku: string;
  name: string;
  oldCost: number | null;
  newCost: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  oldProfit: number | null;
  newProfit: number | null;
  belowTarget: boolean;
  errors: string[];
}

export interface BatchRepricePreview {
  previewId: string;
  rows: BatchRepricePreviewRow[];
  validCount: number;
  invalidCount: number;
  expiresAt: string;
}

export interface BatchRepriceErrorDetail {
  id: string;
  errors: string[];
}

export interface BatchRepriceConfirmation {
  updated: number;
  skipped: number;
  errors: BatchRepriceErrorDetail[];
}

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  version: number;
  archived_at: Date | string | null;
  current_price: number | null;
  evaluated_draft: SimulationDraft | string;
  evaluated_result: PricingBreakdown | string;
}

interface StoredBatchRow extends BatchRepricePreviewRow {
  existingVersion?: number;
  write?: ProductWriteInput;
  evaluation?: ProductEvaluation;
}

interface PreviewRow {
  id: string;
  rows: StoredBatchRow[] | string;
  expires_at: Date | string;
  confirmed_at: Date | string | null;
  confirmation_result: BatchRepriceConfirmation | string | null;
}

function batchError(
  code: BatchErrorCode,
  message: string,
  details?: BatchRepriceErrorDetail[],
): never {
  throw new BatchRepriceError(code, message, details);
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function validateId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ProductValidationError("Produto inválido para recálculo.");
  }

  return value;
}

function validateIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_PRODUCTS) {
    throw new ProductValidationError(
      `Selecione entre 1 e ${MAX_BATCH_PRODUCTS} produtos para recalcular.`,
    );
  }

  const ids = value.map(validateId);

  if (new Set(ids).size !== ids.length) {
    throw new ProductValidationError("A seleção contém produtos repetidos.");
  }

  return ids;
}

function validateNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ProductValidationError(`${label} inválido.`);
  }

  return value;
}

function validatePercent(value: unknown, label: string): number {
  const percent = validateNonNegative(value, label);

  if (percent >= 100) {
    throw new ProductValidationError(`${label} deve ser menor que 100%.`);
  }

  return percent;
}

function validateChanges(value: unknown): BatchRepriceChanges {
  if (!value || typeof value !== "object") {
    throw new ProductValidationError("Informe ao menos uma alteração para recalcular.");
  }

  const changes = value as Record<string, unknown>;
  const normalized: BatchRepriceChanges = {};

  if (changes.costAdjustmentPercent !== undefined) {
    if (
      typeof changes.costAdjustmentPercent !== "number" ||
      !Number.isFinite(changes.costAdjustmentPercent) ||
      changes.costAdjustmentPercent < -100
    ) {
      throw new ProductValidationError("O ajuste percentual de custo é inválido.");
    }

    normalized.costAdjustmentPercent = changes.costAdjustmentPercent;
  }

  if (changes.desiredMarginPercent !== undefined) {
    normalized.desiredMarginPercent = validatePercent(
      changes.desiredMarginPercent,
      "Margem desejada",
    );
  }

  if (changes.commissionPercent !== undefined) {
    normalized.commissionPercent = validatePercent(
      changes.commissionPercent,
      "Comissão",
    );
  }

  if (changes.taxPercent !== undefined) {
    normalized.taxPercent = validatePercent(changes.taxPercent, "Imposto");
  }

  if (changes.fixedFee !== undefined) {
    normalized.fixedFee = validateNonNegative(changes.fixedFee, "Taxa fixa");
  }

  if (changes.tariffMode !== undefined) {
    if (changes.tariffMode !== "manual" && changes.tariffMode !== "ml_drop_off") {
      throw new ProductValidationError("Modo de tarifa inválido.");
    }

    normalized.tariffMode = changes.tariffMode;
  }

  if (changes.confirmedDropOff !== undefined) {
    if (typeof changes.confirmedDropOff !== "boolean") {
      throw new ProductValidationError("Confirmação de Drop Off inválida.");
    }

    normalized.confirmedDropOff = changes.confirmedDropOff;
  }

  if (normalized.tariffMode === "ml_drop_off" && normalized.confirmedDropOff !== true) {
    throw new ProductValidationError(
      "Confirme o uso de ME2 Drop Off antes de aplicar essa tarifa.",
    );
  }

  if (Object.keys(normalized).length === 0) {
    throw new ProductValidationError("Informe ao menos uma alteração para recalcular.");
  }

  return normalized;
}

function validatePreviewId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ProductValidationError("Prévia de recálculo inválida.");
  }

  return value;
}

function validateAllowPartial(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ProductValidationError("Informe como tratar produtos inválidos.");
  }

  return value;
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function adjustedCost(cost: number, adjustmentPercent: number | undefined): number {
  if (adjustmentPercent === undefined) {
    return cost;
  }

  return roundCents(cost * (1 + adjustmentPercent / 100));
}

function rowFromMissingProduct(id: string): StoredBatchRow {
  return {
    id,
    sku: "",
    name: "",
    oldCost: null,
    newCost: null,
    oldPrice: null,
    newPrice: null,
    oldProfit: null,
    newProfit: null,
    belowTarget: false,
    errors: ["Produto não encontrado."],
  };
}

function applyChanges(
  product: ProductRow,
  changes: BatchRepriceChanges,
): StoredBatchRow {
  const oldDraft = parseJson<SimulationDraft>(product.evaluated_draft);
  const oldResult = parseJson<PricingBreakdown>(product.evaluated_result);
  const oldInput = oldDraft.input;
  const tariffMode = changes.tariffMode ?? oldDraft.tariffMode;
  const confirmedDropOff =
    tariffMode === "manual"
      ? false
      : (changes.confirmedDropOff ?? oldDraft.confirmedDropOff);

  if (tariffMode === "ml_drop_off") {
    if (oldDraft.channelId !== "mercado_livre") {
      throw new ProductValidationError(
        "ME2 Drop Off só pode ser aplicado a produtos do Mercado Livre.",
      );
    }

    if (confirmedDropOff !== true) {
      throw new ProductValidationError(
        "Confirme o uso de ME2 Drop Off antes de aplicar essa tarifa.",
      );
    }
  }

  const draft: SimulationDraft = {
    ...oldDraft,
    tariffMode,
    confirmedDropOff,
    input: {
      ...oldInput,
      productCost: adjustedCost(
        oldInput.productCost,
        changes.costAdjustmentPercent,
      ),
      desiredMarginPercent:
        changes.desiredMarginPercent ?? oldInput.desiredMarginPercent,
      commissionPercent:
        changes.commissionPercent ?? oldInput.commissionPercent,
      taxPercent: changes.taxPercent ?? oldInput.taxPercent,
      fixedFee: changes.fixedFee ?? oldInput.fixedFee,
      mode: "margin_to_price",
    },
  };
  const write = validateProductWriteInput({
    sku: product.sku,
    name: product.name,
    draft,
    ...(product.current_price === null
      ? {}
      : { currentPrice: Number(product.current_price) }),
  });
  const evaluation = evaluateProductDraft(write.draft);
  const currentPriceResult =
    product.current_price === null
      ? undefined
      : calculatePricing({
          ...write.draft.input,
          mode: "price_to_profit",
          salePrice: Number(product.current_price),
        });

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    oldCost: oldInput.productCost,
    newCost: write.draft.input.productCost,
    oldPrice: oldResult.suggestedPrice,
    newPrice: evaluation.result.suggestedPrice,
    oldProfit: oldResult.netProfit,
    newProfit: evaluation.result.netProfit,
    belowTarget:
      currentPriceResult !== undefined &&
      currentPriceResult.profitPercent < write.draft.input.desiredMarginPercent,
    errors: [],
    existingVersion: product.version,
    write,
    evaluation,
  };
}

async function lockUser(client: PoolClient, userId: string): Promise<void> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM "user" WHERE id = $1 FOR UPDATE',
    [userId],
  );

  if (!result.rows[0]) {
    return batchError("BATCH_PREVIEW_NOT_FOUND", "Conta não encontrada.");
  }
}

async function assertProEntitlement(
  client: PoolClient,
  userId: string,
): Promise<void> {
  const result = await client.query<{ expires_at: Date | string | null }>(
    `
      SELECT expires_at
      FROM account_entitlement
      WHERE user_id = $1 AND plan = 'pro'
    `,
    [userId],
  );
  const expiresAt = result.rows[0]?.expires_at;

  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return batchError(
      "BATCH_PRO_REQUIRED",
      "O recálculo em lote está disponível no plano PRO ativo.",
    );
  }
}

async function findProducts(
  client: PoolClient,
  userId: string,
  ids: string[],
): Promise<Map<string, ProductRow>> {
  const result = await client.query<ProductRow>(
    `
      SELECT
        id, sku, name, version, archived_at, current_price,
        evaluated_draft, evaluated_result
      FROM catalog_product
      WHERE user_id = $1 AND id = ANY($2::text[])
    `,
    [userId, ids],
  );

  return new Map(result.rows.map((product) => [product.id, product]));
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

async function updateProduct(
  client: PoolClient,
  userId: string,
  row: StoredBatchRow,
  write: ProductWriteInput,
  evaluation: ProductEvaluation,
): Promise<void> {
  if (row.existingVersion === undefined) {
    return batchError("BATCH_CONFLICT", "A prévia de recálculo é inválida.");
  }

  const result = await client.query<ProductRow>(
    `
      SELECT
        id, sku, name, version, archived_at, current_price,
        evaluated_draft, evaluated_result
      FROM catalog_product
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
    `,
    [row.id, userId],
  );
  const existing = result.rows[0];

  if (!existing || existing.archived_at || existing.version !== row.existingVersion) {
    return batchError(
      "BATCH_CONFLICT",
      "Um produto foi alterado desde a prévia. Gere uma nova prévia antes de confirmar.",
    );
  }

  const nextVersion = existing.version + 1;
  await client.query(
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
    `,
    [row.id, userId, ...productValues(write, evaluation), nextVersion],
  );
  await insertEvaluation(client, row.id, nextVersion, evaluation);
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

function rowError(row: StoredBatchRow, message: string): BatchRepriceErrorDetail {
  return { id: row.id, errors: [message] };
}

function revalidateStoredRow(row: StoredBatchRow): {
  write: ProductWriteInput;
  evaluation: ProductEvaluation;
} {
  if (!row.write) {
    return batchError("BATCH_CONFLICT", "A prévia contém um produto inválido.");
  }

  const write = validateProductWriteInput(row.write);

  return { write, evaluation: evaluateProductDraft(write.draft) };
}

function toPublicRow(row: StoredBatchRow): BatchRepricePreviewRow {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    oldCost: row.oldCost,
    newCost: row.newCost,
    oldPrice: row.oldPrice,
    newPrice: row.newPrice,
    oldProfit: row.oldProfit,
    newProfit: row.newProfit,
    belowTarget: row.belowTarget,
    errors: row.errors,
  };
}

export async function createBatchRepricePreview(
  userId: string,
  value: unknown,
): Promise<BatchRepricePreview> {
  if (!value || typeof value !== "object") {
    throw new ProductValidationError("Recálculo inválido.");
  }

  const request = value as Record<string, unknown>;
  const ids = validateIds(request.ids);
  const changes = validateChanges(request.changes);
  const client = await getDb().connect();

  try {
    await assertProEntitlement(client, userId);
    const products = await findProducts(client, userId, ids);
    const rows: StoredBatchRow[] = [];

    for (const id of ids) {
      const product = products.get(id);

      if (!product) {
        rows.push(rowFromMissingProduct(id));
        continue;
      }

      if (product.archived_at) {
        rows.push({
          id,
          sku: product.sku,
          name: product.name,
          oldCost: null,
          newCost: null,
          oldPrice: null,
          newPrice: null,
          oldProfit: null,
          newProfit: null,
          belowTarget: false,
          errors: ["Restaure o produto antes de recalcular."],
        });
        continue;
      }

      try {
        rows.push(applyChanges(product, changes));
      } catch (error) {
        rows.push({
          id,
          sku: product.sku,
          name: product.name,
          oldCost: null,
          newCost: null,
          oldPrice: null,
          newPrice: null,
          oldProfit: null,
          newProfit: null,
          belowTarget: false,
          errors: [
            error instanceof ProductValidationError
              ? error.message
              : "Não foi possível recalcular o produto.",
          ],
        });
      }
    }

    const previewId = randomUUID();
    const expiresAt = new Date(Date.now() + BATCH_PREVIEW_TTL_MS);
    const validCount = rows.filter((row) => row.errors.length === 0).length;
    const invalidCount = rows.length - validCount;

    await client.query(
      `
        INSERT INTO catalog_batch_reprice_preview (
          id, user_id, changes, rows, valid_count, invalid_count, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        previewId,
        userId,
        JSON.stringify(changes),
        JSON.stringify(rows),
        validCount,
        invalidCount,
        expiresAt,
      ],
    );
    await client.query(
      "DELETE FROM catalog_batch_reprice_preview WHERE expires_at < NOW() - INTERVAL '1 day'",
    );

    return {
      previewId,
      rows: rows.map(toPublicRow),
      validCount,
      invalidCount,
      expiresAt: expiresAt.toISOString(),
    };
  } finally {
    client.release();
  }
}

export async function confirmBatchReprice(
  userId: string,
  value: unknown,
): Promise<BatchRepriceConfirmation> {
  if (!value || typeof value !== "object") {
    throw new ProductValidationError("Confirmação de recálculo inválida.");
  }

  const request = value as Record<string, unknown>;
  const previewId = validatePreviewId(request.previewId);
  const allowPartial = validateAllowPartial(request.allowPartial);

  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const result = await client.query<PreviewRow>(
      `
        SELECT id, rows, expires_at, confirmed_at, confirmation_result
        FROM catalog_batch_reprice_preview
        WHERE id = $1 AND user_id = $2
        FOR UPDATE
      `,
      [previewId, userId],
    );
    const preview = result.rows[0];

    if (!preview) {
      return batchError(
        "BATCH_PREVIEW_NOT_FOUND",
        "Prévia de recálculo não encontrada.",
      );
    }

    if (preview.confirmed_at && preview.confirmation_result) {
      return parseJson<BatchRepriceConfirmation>(preview.confirmation_result);
    }

    if (new Date(preview.expires_at).getTime() <= Date.now()) {
      return batchError(
        "BATCH_PREVIEW_EXPIRED",
        "A prévia expirou. Gere uma nova antes de confirmar.",
      );
    }

    await assertProEntitlement(client, userId);
    const rows = parseJson<StoredBatchRow[]>(preview.rows);
    const previewErrors = rows
      .filter((row) => row.errors.length > 0)
      .map((row) => ({ id: row.id, errors: row.errors }));

    if (!allowPartial && previewErrors.length > 0) {
      return batchError(
        "BATCH_CONFIRMATION_BLOCKED",
        "Corrija os produtos inválidos ou confirme permitindo recálculo parcial.",
        previewErrors,
      );
    }

    const confirmation: BatchRepriceConfirmation = {
      updated: 0,
      skipped: previewErrors.length,
      errors: [...previewErrors],
    };

    for (const [index, row] of rows.entries()) {
      if (row.errors.length > 0) {
        continue;
      }

      const savepoint = `batch_reprice_row_${index}`;
      await client.query(`SAVEPOINT ${savepoint}`);

      try {
        const { write, evaluation } = revalidateStoredRow(row);
        await updateProduct(client, userId, row, write, evaluation);
        confirmation.updated += 1;
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (error) {
        if (allowPartial) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        }

        const detail = rowError(
          row,
          error instanceof BatchRepriceError ||
            error instanceof ProductValidationError
            ? error.message
            : "Não foi possível recalcular o produto.",
        );

        if (!allowPartial) {
          return batchError(
            "BATCH_CONFLICT",
            "O catálogo foi alterado desde a prévia. Gere uma nova prévia antes de confirmar.",
            [...confirmation.errors, detail],
          );
        }

        confirmation.skipped += 1;
        confirmation.errors.push(detail);
      }
    }

    await client.query(
      `
        UPDATE catalog_batch_reprice_preview
        SET confirmed_at = NOW(), confirmation_result = $3
        WHERE id = $1 AND user_id = $2
      `,
      [previewId, userId, JSON.stringify(confirmation)],
    );

    return confirmation;
  });
}
