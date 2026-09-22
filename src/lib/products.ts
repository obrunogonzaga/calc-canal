import { calculatePricing, type PricingBreakdown } from "./pricing";
import {
  validateDraft,
  type SimulationDraft,
} from "./simulation-draft";
import { mlDropOffRule } from "./tariffs";
import type { ChannelId } from "@/types/channels";

export type ProductPlan = "free" | "pro";
export type ProductListStatus = "active" | "archived" | "all";

export interface ProductEntitlement {
  plan: ProductPlan;
  limit: 5 | 500;
  count: number;
  archivedCount: number;
  requiresSelection: boolean;
  selectedEditableCount: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  channelId: ChannelId;
  currentPrice?: number;
  draft: SimulationDraft;
  result: PricingBreakdown;
  ruleId: string;
  version: number;
  archivedAt?: string;
  editable: boolean;
  updatedAt: string;
}

export interface ProductWriteInput {
  sku: string;
  name: string;
  draft: SimulationDraft;
  currentPrice?: number;
}

export interface ProductEvaluation {
  draft: SimulationDraft;
  result: PricingBreakdown;
  ruleId: string;
}

export interface ProductListResult {
  products: Product[];
  entitlement: ProductEntitlement;
}

export class ProductValidationError extends Error {
  readonly code = "INVALID_PRODUCT";
}

function invalidProduct(message: string): never {
  throw new ProductValidationError(message);
}

function sanitizeSku(value: unknown): string {
  if (typeof value !== "string") {
    return invalidProduct("Informe um SKU válido.");
  }

  const sku = value.trim();

  if (!sku || sku.length > 64 || /[\u0000-\u001f\u007f]/.test(sku)) {
    return invalidProduct("Informe um SKU válido.");
  }

  return sku;
}

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") {
    return invalidProduct("Informe um nome de produto válido.");
  }

  const name = value.trim();

  if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) {
    return invalidProduct("Informe um nome de produto válido.");
  }

  return name;
}

function sanitizeCurrentPrice(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return invalidProduct("Informe um preço atual válido.");
  }

  const cents = Math.round((value + Number.EPSILON) * 100);

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return invalidProduct("Informe um preço atual válido.");
  }

  return cents / 100;
}

export function validateProductWriteInput(value: unknown): ProductWriteInput {
  if (!value || typeof value !== "object") {
    return invalidProduct("Produto inválido.");
  }

  const candidate = value as Record<string, unknown>;
  let draft: SimulationDraft;

  try {
    draft = validateDraft(candidate.draft);
  } catch (error) {
    return invalidProduct(
      error instanceof Error ? error.message : "Produto inválido."
    );
  }

  return {
    sku: sanitizeSku(candidate.sku),
    name: sanitizeName(candidate.name),
    draft,
    currentPrice: sanitizeCurrentPrice(candidate.currentPrice),
  };
}

export function evaluateProductDraft(draft: SimulationDraft): ProductEvaluation {
  try {
    return {
      draft,
      result: calculatePricing(draft.input),
      ruleId: draft.tariffMode === "manual" ? "manual-v1" : mlDropOffRule.id,
    };
  } catch (error) {
    return invalidProduct(
      error instanceof Error ? error.message : "Não foi possível calcular o produto."
    );
  }
}

export function validateProductVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    return invalidProduct("A versão do produto é inválida.");
  }

  return value;
}

export function validateProductSelection(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return invalidProduct("Seleção de produtos inválida.");
  }

  const ids = (value as Record<string, unknown>).ids;

  if (!Array.isArray(ids) || ids.length > 5) {
    return invalidProduct("Selecione no máximo cinco produtos.");
  }

  const uniqueIds = new Set<string>();

  for (const id of ids) {
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      return invalidProduct("Seleção de produtos inválida.");
    }

    uniqueIds.add(id);
  }

  if (uniqueIds.size !== ids.length) {
    return invalidProduct("Seleção de produtos inválida.");
  }

  return ids;
}

export function validateProductListStatus(value: string | null): ProductListStatus {
  if (!value || value === "active") {
    return "active";
  }

  if (value === "archived" || value === "all") {
    return value;
  }

  return invalidProduct("Filtro de produtos inválido.");
}

export function validateProductSearch(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const search = value.trim();

  if (!search) {
    return undefined;
  }

  if (search.length > 100) {
    return invalidProduct("A busca de produtos é muito longa.");
  }

  return search;
}
