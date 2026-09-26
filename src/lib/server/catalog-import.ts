import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import {
  parseCatalogCsv,
  type CsvProductRow,
} from "@/lib/catalog-csv";
import {
  ProductValidationError,
  evaluateProductDraft,
  validateProductWriteInput,
  type ProductEvaluation,
  type ProductWriteInput,
} from "@/lib/products";
import type { PricingBreakdown } from "@/lib/pricing";
import type { SimulationDraft } from "@/lib/simulation-draft";

import { getDb } from "./db";

const IMPORT_PREVIEW_TTL_MS = 15 * 60 * 1000;
const PRO_PRODUCT_LIMIT = 500;

type ImportAction = "create" | "update" | "invalid";
type ImportErrorCode =
  | "IMPORT_CONFIRMATION_BLOCKED"
  | "IMPORT_CONFLICT"
  | "IMPORT_PREVIEW_EXPIRED"
  | "IMPORT_PREVIEW_NOT_FOUND"
  | "IMPORT_PRO_REQUIRED";

export class CatalogImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
    readonly details?: CatalogImportErrorDetail[],
  ) {
    super(message);
  }
}

export interface CatalogImportDefaults {
  channelId: SimulationDraft["channelId"];
  commissionPercent: number;
  taxPercent: number;
  fixedFee: number;
  packaging: number;
  sellerShipping: number;
  desiredMarginPercent: number;
}

export interface CatalogImportPreviewRow {
  line: number;
  sku: string;
  name: string;
  cost: number | null;
  quantity: number | null;
  desiredMarginPercent: number | null;
  action: ImportAction;
  errors: string[];
  oldPrice?: number;
  newPrice?: number;
}

export interface CatalogImportPreview {
  previewId: string;
  rows: CatalogImportPreviewRow[];
  validCount: number;
  invalidCount: number;
  expiresAt: string;
}

export interface CatalogImportErrorDetail {
  line: number;
  errors: string[];
}

export interface CatalogImportConfirmation {
  created: number;
  updated: number;
  skipped: number;
  errors: CatalogImportErrorDetail[];
}

interface ExistingProductRow {
  id: string;
  version: number;
  archived_at: Date | string | null;
  current_price: number | null;
  evaluated_result: PricingBreakdown | string;
}

interface StoredImportRow extends CatalogImportPreviewRow {
  write?: ProductWriteInput;
  evaluation?: ProductEvaluation;
  existingId?: string;
  existingVersion?: number;
}

interface PreviewRow {
  id: string;
  update_existing: boolean;
  rows: StoredImportRow[] | string;
  valid_count: number;
  invalid_count: number;
  expires_at: Date | string;
  confirmed_at: Date | string | null;
  confirmation_result: CatalogImportConfirmation | string | null;
}

function importError(
  code: ImportErrorCode,
  message: string,
  details?: CatalogImportErrorDetail[],
): never {
  throw new CatalogImportError(code, message, details);
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function priceFromResult(value: PricingBreakdown | string): number {
  return parseJson<PricingBreakdown>(value).suggestedPrice;
}

function validateFiniteNonNegative(
  value: unknown,
  label: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ProductValidationError(`${label} inválido.`);
  }

  return value;
}

function validatePercent(value: unknown, label: string): number {
  const percent = validateFiniteNonNegative(value, label);

  if (percent >= 100) {
    throw new ProductValidationError(`${label} deve ser menor que 100%.`);
  }

  return percent;
}

function validateImportDefaults(value: unknown): CatalogImportDefaults {
  if (!value || typeof value !== "object") {
    throw new ProductValidationError("Informe os padrões da importação.");
  }

  const defaults = value as Record<string, unknown>;
  const channelId = defaults.channelId;

  if (
    channelId !== "mercado_livre" &&
    channelId !== "shopee" &&
    channelId !== "amazon_br" &&
    channelId !== "magalu"
  ) {
    throw new ProductValidationError("Canal padrão inválido.");
  }

  return {
    channelId,
    commissionPercent: validatePercent(defaults.commissionPercent, "Comissão"),
    taxPercent: validatePercent(defaults.taxPercent, "Imposto"),
    fixedFee: validateFiniteNonNegative(defaults.fixedFee, "Taxa fixa"),
    packaging: validateFiniteNonNegative(defaults.packaging, "Embalagem"),
    sellerShipping: validateFiniteNonNegative(
      defaults.sellerShipping,
      "Frete do vendedor",
    ),
    desiredMarginPercent: validatePercent(
      defaults.desiredMarginPercent,
      "Margem desejada",
    ),
  };
}

function buildDraft(
  row: CsvProductRow,
  defaults: CatalogImportDefaults,
): SimulationDraft {
  if (row.cost === null) {
    throw new ProductValidationError("Custo inválido.");
  }

  return {
    version: 1,
    channelId: defaults.channelId,
    tariffMode: "manual",
    confirmedDropOff: false,
    excludeTax: false,
    input: {
      productCost: row.cost,
      packaging: defaults.packaging,
      sellerShipping: defaults.sellerShipping,
      desiredMarginPercent:
        row.desiredMarginPercent ?? defaults.desiredMarginPercent,
      taxPercent: defaults.taxPercent,
      commissionPercent: defaults.commissionPercent,
      fixedFee: defaults.fixedFee,
      mode: "margin_to_price",
    },
  };
}

function toPublicPreviewRow(row: StoredImportRow): CatalogImportPreviewRow {
  return {
    line: row.line,
    sku: row.sku,
    name: row.name,
    cost: row.cost,
    quantity: row.quantity,
    desiredMarginPercent: row.desiredMarginPercent,
    action: row.action,
    errors: row.errors,
    ...(row.oldPrice === undefined ? {} : { oldPrice: row.oldPrice }),
    ...(row.newPrice === undefined ? {} : { newPrice: row.newPrice }),
  };
}

function validatePreviewId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ProductValidationError("Prévia de importação inválida.");
  }

  return value;
}

function validateAllowPartial(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ProductValidationError("Informe como tratar linhas inválidas.");
  }

  return value;
}

async function lockUser(client: PoolClient, userId: string): Promise<void> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM "user" WHERE id = $1 FOR UPDATE',
    [userId],
  );

  if (!result.rows[0]) {
    return importError("IMPORT_PREVIEW_NOT_FOUND", "Conta não encontrada.");
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
    return importError(
      "IMPORT_PRO_REQUIRED",
      "A importação CSV está disponível no plano PRO ativo.",
    );
  }
}

async function activeProductCount(
  client: PoolClient,
  userId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM catalog_product WHERE user_id = $1 AND archived_at IS NULL",
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function findExistingProduct(
  client: PoolClient,
  userId: string,
  sku: string,
): Promise<ExistingProductRow | undefined> {
  const result = await client.query<ExistingProductRow>(
    `
      SELECT id, version, archived_at, current_price, evaluated_result
      FROM catalog_product
      WHERE user_id = $1 AND LOWER(sku) = LOWER($2)
    `,
    [userId, sku],
  );

  return result.rows[0];
}

async function buildPreviewRows(
  client: PoolClient,
  userId: string,
  rows: CsvProductRow[],
  defaults: CatalogImportDefaults,
  updateExisting: boolean,
): Promise<StoredImportRow[]> {
  let plannedActiveCount = await activeProductCount(client, userId);
  const previewRows: StoredImportRow[] = [];

  for (const row of rows) {
    const errors = [...row.errors];
    const stored: StoredImportRow = {
      line: row.line,
      sku: row.sku,
      name: row.name,
      cost: row.cost,
      quantity: row.quantity,
      desiredMarginPercent:
        row.desiredMarginPercent ?? defaults.desiredMarginPercent,
      action: "invalid",
      errors,
    };

    if (errors.length > 0) {
      previewRows.push(stored);
      continue;
    }

    try {
      let write = validateProductWriteInput({
        sku: row.sku,
        name: row.name,
        draft: buildDraft(row, defaults),
      });
      const evaluation = evaluateProductDraft(write.draft);
      const existing = await findExistingProduct(client, userId, write.sku);

      stored.write = write;
      stored.evaluation = evaluation;
      stored.newPrice = evaluation.result.suggestedPrice;

      if (existing) {
        stored.oldPrice = priceFromResult(existing.evaluated_result);
        write = {
          ...write,
          ...(existing.current_price === null
            ? {}
            : { currentPrice: Number(existing.current_price) }),
        };
        stored.write = write;

        if (!updateExisting) {
          stored.errors.push(
            `Linha ${row.line}: SKU já existe. Marque atualização de existentes para sobrescrevê-lo.`,
          );
        } else if (existing.archived_at) {
          stored.errors.push(
            `Linha ${row.line}: restaure o produto existente antes de atualizá-lo.`,
          );
        } else {
          stored.action = "update";
          stored.existingId = existing.id;
          stored.existingVersion = existing.version;
        }
      } else if (plannedActiveCount >= PRO_PRODUCT_LIMIT) {
        stored.errors.push(
          `Linha ${row.line}: o limite de ${PRO_PRODUCT_LIMIT} produtos ativos do PRO seria excedido.`,
        );
      } else {
        stored.action = "create";
        plannedActiveCount += 1;
      }
    } catch (error) {
      stored.errors.push(
        error instanceof Error
          ? `Linha ${row.line}: ${error.message}`
          : `Linha ${row.line}: produto inválido.`,
      );
    }

    if (stored.errors.length > 0) {
      stored.action = "invalid";
    }

    previewRows.push(stored);
  }

  return previewRows;
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

async function insertProduct(
  client: PoolClient,
  userId: string,
  write: ProductWriteInput,
  evaluation: ProductEvaluation,
): Promise<void> {
  const id = randomUUID();
  const result = await client.query<{ version: number }>(
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
      RETURNING version
    `,
    [id, userId, ...productValues(write, evaluation)],
  );

  await insertEvaluation(client, id, result.rows[0]!.version, evaluation);
}

async function updateProduct(
  client: PoolClient,
  userId: string,
  row: StoredImportRow,
  write: ProductWriteInput,
  evaluation: ProductEvaluation,
): Promise<void> {
  if (!row.existingId || row.existingVersion === undefined) {
    return importError("IMPORT_CONFLICT", "A prévia de atualização é inválida.");
  }

  const existingResult = await client.query<ExistingProductRow>(
    `
      SELECT id, version, archived_at, current_price, evaluated_result
      FROM catalog_product
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
    `,
    [row.existingId, userId],
  );
  const existing = existingResult.rows[0];

  if (!existing || existing.archived_at || existing.version !== row.existingVersion) {
    return importError(
      "IMPORT_CONFLICT",
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
    [row.existingId, userId, ...productValues(write, evaluation), nextVersion],
  );
  await insertEvaluation(client, row.existingId, nextVersion, evaluation);
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

function lineError(row: StoredImportRow, message: string): CatalogImportErrorDetail {
  return { line: row.line, errors: [message] };
}

function revalidateStoredRow(row: StoredImportRow): {
  write: ProductWriteInput;
  evaluation: ProductEvaluation;
} {
  if (!row.write) {
    return importError("IMPORT_CONFLICT", "A prévia contém uma linha inválida.");
  }

  const write = validateProductWriteInput(row.write);

  return { write, evaluation: evaluateProductDraft(write.draft) };
}

export async function createCatalogImportPreview(
  userId: string,
  value: unknown,
): Promise<CatalogImportPreview> {
  if (!value || typeof value !== "object") {
    throw new ProductValidationError("Importação inválida.");
  }

  const request = value as Record<string, unknown>;

  if (typeof request.csv !== "string" || typeof request.updateExisting !== "boolean") {
    throw new ProductValidationError("Importação inválida.");
  }

  const defaults = validateImportDefaults(request.defaults);
  const client = await getDb().connect();

  try {
    await assertProEntitlement(client, userId);
    let parsed;
    try {
      parsed = parseCatalogCsv(request.csv);
    } catch (error) {
      if (error instanceof Error) throw new ProductValidationError(error.message);
      throw error;
    }

    if (parsed.rows.length === 0) {
      throw new ProductValidationError("Inclua ao menos uma linha de produto no CSV.");
    }

    const rows = await buildPreviewRows(
      client,
      userId,
      parsed.rows,
      defaults,
      request.updateExisting,
    );
    const previewId = randomUUID();
    const expiresAt = new Date(Date.now() + IMPORT_PREVIEW_TTL_MS);
    const validCount = rows.filter((row) => row.action !== "invalid").length;
    const invalidCount = rows.length - validCount;

    await client.query(
      `
        INSERT INTO catalog_import_preview (
          id, user_id, update_existing, defaults, rows, valid_count,
          invalid_count, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        previewId,
        userId,
        request.updateExisting,
        JSON.stringify(defaults),
        JSON.stringify(rows),
        validCount,
        invalidCount,
        expiresAt,
      ],
    );
    await client.query(
      "DELETE FROM catalog_import_preview WHERE expires_at < NOW() - INTERVAL '1 day'",
    );

    return {
      previewId,
      rows: rows.map(toPublicPreviewRow),
      validCount,
      invalidCount,
      expiresAt: expiresAt.toISOString(),
    };
  } finally {
    client.release();
  }
}

export async function confirmCatalogImport(
  userId: string,
  value: unknown,
): Promise<CatalogImportConfirmation> {
  if (!value || typeof value !== "object") {
    throw new ProductValidationError("Confirmação de importação inválida.");
  }

  const request = value as Record<string, unknown>;
  const previewId = validatePreviewId(request.previewId);
  const allowPartial = validateAllowPartial(request.allowPartial);

  return withTransaction(async (client) => {
    await lockUser(client, userId);
    const previewResult = await client.query<PreviewRow>(
      `
        SELECT
          id, update_existing, rows, valid_count, invalid_count, expires_at,
          confirmed_at, confirmation_result
        FROM catalog_import_preview
        WHERE id = $1 AND user_id = $2
        FOR UPDATE
      `,
      [previewId, userId],
    );
    const preview = previewResult.rows[0];

    if (!preview) {
      return importError(
        "IMPORT_PREVIEW_NOT_FOUND",
        "Prévia de importação não encontrada.",
      );
    }

    if (preview.confirmed_at && preview.confirmation_result) {
      return parseJson<CatalogImportConfirmation>(preview.confirmation_result);
    }

    if (new Date(preview.expires_at).getTime() <= Date.now()) {
      return importError(
        "IMPORT_PREVIEW_EXPIRED",
        "A prévia expirou. Gere uma nova antes de confirmar.",
      );
    }

    await assertProEntitlement(client, userId);
    const rows = parseJson<StoredImportRow[]>(preview.rows);
    const previewErrors = rows
      .filter((row) => row.action === "invalid")
      .map((row) => ({ line: row.line, errors: row.errors }));

    if (!allowPartial && previewErrors.length > 0) {
      return importError(
        "IMPORT_CONFIRMATION_BLOCKED",
        "Corrija as linhas inválidas ou confirme permitindo importação parcial.",
        previewErrors,
      );
    }

    let activeCount = await activeProductCount(client, userId);
    const confirmation: CatalogImportConfirmation = {
      created: 0,
      updated: 0,
      skipped: previewErrors.length,
      errors: [...previewErrors],
    };

    for (const [index, row] of rows.entries()) {
      if (row.action === "invalid") {
        continue;
      }

      const savepoint = `catalog_import_row_${index}`;
      await client.query(`SAVEPOINT ${savepoint}`);

      try {
        const { write, evaluation } = revalidateStoredRow(row);

        if (row.action === "create") {
          const duplicate = await findExistingProduct(client, userId, write.sku);

          if (duplicate) {
            return importError(
              "IMPORT_CONFLICT",
              "Um SKU foi criado desde a prévia. Gere uma nova prévia antes de confirmar.",
            );
          }

          if (activeCount >= PRO_PRODUCT_LIMIT) {
            return importError(
              "IMPORT_CONFLICT",
              "O limite de produtos ativos mudou desde a prévia.",
            );
          }

          await insertProduct(client, userId, write, evaluation);
          activeCount += 1;
          confirmation.created += 1;
        } else {
          await updateProduct(client, userId, row, write, evaluation);
          confirmation.updated += 1;
        }
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (error) {
        if (allowPartial) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        }

        const detail = lineError(
          row,
          error instanceof CatalogImportError ||
            error instanceof ProductValidationError
            ? error.message
            : "Não foi possível importar a linha.",
        );

        if (!allowPartial) {
          return importError(
            "IMPORT_CONFLICT",
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
        UPDATE catalog_import_preview
        SET confirmed_at = NOW(), confirmation_result = $3
        WHERE id = $1 AND user_id = $2
      `,
      [previewId, userId, JSON.stringify(confirmation)],
    );

    return confirmation;
  });
}
