/**
 * Líquido — fórmulas de precificação marketplace (BR)
 *
 * Todos os valores monetários são convertidos para centavos antes do cálculo.
 * A margem desejada é contribuição estimada ÷ preço de venda.
 */

export type CalcMode = "margin_to_price" | "price_to_profit";

export interface PricingInput {
  productCost: number;
  packaging: number;
  sellerShipping: number;
  desiredMarginPercent: number;
  taxPercent: number;
  commissionPercent: number;
  fixedFee: number;
  salePrice?: number;
  mode: CalcMode;
}

export interface PricingBreakdown {
  productCost: number;
  packaging: number;
  sellerShipping: number;
  fixedFee: number;
  commission: number;
  tax: number;
  netProfit: number;
  profitPercent: number;
  suggestedPrice: number;
}

interface ChargesInCents {
  commissionCents: number;
  taxCents: number;
}

const CENTS_PER_REAL = 100;
const MAX_MONEY_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / CENTS_PER_REAL);
const MAX_PRICE_SEARCH_CENTS = 1_000_000;

function roundToCents(value: number): number {
  return Math.round(value);
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCents(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} deve ser um número finito.`);
  }

  if (value < 0) {
    throw new Error(`${label} não pode ser negativo.`);
  }

  const scaled = value * CENTS_PER_REAL;

  if (!Number.isFinite(scaled) || scaled > MAX_MONEY_CENTS + 0.5) {
    throw new Error(`${label} excede o limite de valor suportado.`);
  }

  return roundToCents(scaled + Number.EPSILON);
}

function assertPercent(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} deve ser um número finito.`);
  }

  if (value < 0) {
    throw new Error(`${label} não pode ser negativo.`);
  }

  if (value >= 100) {
    throw new Error(`${label} deve ser menor que 100%.`);
  }

  return value;
}

function calculatePercentageFee(
  salePriceCents: number,
  percent: number
): number {
  return roundToCents((salePriceCents * percent) / 100);
}

function calculateCharges(
  salePriceCents: number,
  commissionPercent: number,
  taxPercent: number
): ChargesInCents {
  return {
    commissionCents: calculatePercentageFee(salePriceCents, commissionPercent),
    taxCents: calculatePercentageFee(salePriceCents, taxPercent),
  };
}

function reachesDesiredMargin(
  salePriceCents: number,
  baseCents: number,
  commissionPercent: number,
  taxPercent: number,
  desiredMarginPercent: number
): boolean {
  const charges = calculateCharges(salePriceCents, commissionPercent, taxPercent);
  const netProfitCents =
    salePriceCents - baseCents - charges.commissionCents - charges.taxCents;
  const requiredProfitCents = (salePriceCents * desiredMarginPercent) / 100;

  return netProfitCents >= requiredProfitCents;
}

function findSuggestedPriceCents(
  baseCents: number,
  commissionPercent: number,
  taxPercent: number,
  desiredMarginPercent: number
): number {
  if (commissionPercent + taxPercent + desiredMarginPercent >= 100) {
    throw new Error(
      "Soma de comissão, imposto e margem ≥ 100%. Reduza a margem ou taxas."
    );
  }

  const feeRates = [commissionPercent, taxPercent].filter((rate) => rate > 0);
  const remainingRate =
    1 - (commissionPercent + taxPercent + desiredMarginPercent) / 100;

  // Cada tarifa percentual é arredondada para centavos. A diferença total em
  // relação à conta exata é no máximo meio centavo por tarifa; esse intervalo
  // contém todo preço que pode ser o primeiro a cumprir a margem.
  const roundingAllowance = feeRates.length / 2;
  const lowerBound = (baseCents - roundingAllowance) / remainingRate;
  const upperBound = (baseCents + roundingAllowance) / remainingRate;

  if (!Number.isFinite(lowerBound) || !Number.isFinite(upperBound)) {
    throw new Error("Não foi possível calcular um preço sugerido finito.");
  }

  const fromCents = Math.max(1, Math.floor(lowerBound) - 2);
  const toCents = Math.min(
    MAX_MONEY_CENTS,
    Math.max(1, Math.ceil(upperBound) + 2)
  );

  if (toCents < fromCents) {
    throw new Error("Não foi possível calcular um preço sugerido finito.");
  }

  if (toCents - fromCents + 1 > MAX_PRICE_SEARCH_CENTS) {
    throw new Error(
      "As taxas informadas exigem uma busca de preço acima do limite seguro."
    );
  }

  for (
    let salePriceCents = fromCents;
    salePriceCents <= toCents;
    salePriceCents += 1
  ) {
    if (
      reachesDesiredMargin(
        salePriceCents,
        baseCents,
        commissionPercent,
        taxPercent,
        desiredMarginPercent
      )
    ) {
      return salePriceCents;
    }
  }

  throw new Error(
    "Não há preço em centavos que atenda à margem com as taxas informadas."
  );
}

function toBreakdown(
  productCostCents: number,
  packagingCents: number,
  sellerShippingCents: number,
  fixedFeeCents: number,
  salePriceCents: number,
  commissionPercent: number,
  taxPercent: number
): PricingBreakdown {
  const charges = calculateCharges(salePriceCents, commissionPercent, taxPercent);
  const netProfitCents =
    salePriceCents -
    productCostCents -
    packagingCents -
    sellerShippingCents -
    fixedFeeCents -
    charges.commissionCents -
    charges.taxCents;

  return {
    productCost: productCostCents / CENTS_PER_REAL,
    packaging: packagingCents / CENTS_PER_REAL,
    sellerShipping: sellerShippingCents / CENTS_PER_REAL,
    fixedFee: fixedFeeCents / CENTS_PER_REAL,
    commission: charges.commissionCents / CENTS_PER_REAL,
    tax: charges.taxCents / CENTS_PER_REAL,
    netProfit: netProfitCents / CENTS_PER_REAL,
    profitPercent:
      salePriceCents > 0
        ? roundToTwoDecimals((netProfitCents / salePriceCents) * 100)
        : 0,
    suggestedPrice: salePriceCents / CENTS_PER_REAL,
  };
}

export function calculatePricing(input: PricingInput): PricingBreakdown {
  if (!input || typeof input !== "object") {
    throw new Error("Informe os dados de precificação.");
  }

  if (input.mode !== "margin_to_price" && input.mode !== "price_to_profit") {
    throw new Error("Modo de cálculo inválido.");
  }

  const productCostCents = toCents(input.productCost, "Custo do produto");
  const packagingCents = toCents(input.packaging, "Embalagem");
  const sellerShippingCents = toCents(input.sellerShipping, "Frete do vendedor");
  const fixedFeeCents = toCents(input.fixedFee, "Taxa fixa");
  const desiredMarginPercent = assertPercent(
    input.desiredMarginPercent,
    "Margem desejada"
  );
  const taxPercent = assertPercent(input.taxPercent, "Imposto");
  const commissionPercent = assertPercent(input.commissionPercent, "Comissão");

  if (commissionPercent + taxPercent >= 100) {
    throw new Error(
      "Soma de comissão e imposto ≥ 100%. Reduza as taxas informadas."
    );
  }

  const baseCents =
    productCostCents + packagingCents + sellerShippingCents + fixedFeeCents;

  if (!Number.isSafeInteger(baseCents) || baseCents > MAX_MONEY_CENTS) {
    throw new Error("A soma dos custos excede o limite de valor suportado.");
  }

  const salePriceCents =
    input.mode === "margin_to_price"
      ? findSuggestedPriceCents(
          baseCents,
          commissionPercent,
          taxPercent,
          desiredMarginPercent
        )
      : toCents(input.salePrice ?? Number.NaN, "Preço de venda");

  if (salePriceCents <= 0) {
    throw new Error("Informe um preço de venda válido.");
  }

  return toBreakdown(
    productCostCents,
    packagingCents,
    sellerShippingCents,
    fixedFeeCents,
    salePriceCents,
    commissionPercent,
    taxPercent
  );
}

export function formatBRL(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Valor para formatação deve ser finito.");
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
