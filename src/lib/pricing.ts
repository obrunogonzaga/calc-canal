/**
 * CalcCanal — fórmulas de precificação marketplace (BR)
 *
 * Custos fixos por venda (R$):
 *   base = custoProduto + embalagem + freteSeller + taxaFixaCanal
 *
 * Encargos sobre preço de venda P (R$):
 *   comissão = P × (comissão% / 100)
 *   imposto  = P × (imposto% / 100)
 *
 * Modo A — custo + margem → preço sugerido
 *   Margem desejada = lucro líquido ÷ preço de venda (markup sobre receita).
 *   lucro = P × (margem% / 100)
 *   P = base + comissão + imposto + lucro
 *   P × (1 − (comissão% + imposto% + margem%) / 100) = base
 *   P = base / (1 − (comissão% + imposto% + margem%) / 100)
 *
 * Modo B — preço de venda → lucro líquido
 *   lucro = P − base − comissão − imposto
 *   % lucro = (lucro / P) × 100
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePricing(input: PricingInput): PricingBreakdown {
  const base =
    input.productCost + input.packaging + input.sellerShipping + input.fixedFee;

  const rateSum =
    (input.commissionPercent + input.taxPercent) / 100;

  if (input.mode === "margin_to_price") {
    const marginRate = input.desiredMarginPercent / 100;
    const divisor = 1 - rateSum - marginRate;

    if (divisor <= 0) {
      throw new Error(
        "Soma de comissão, imposto e margem ≥ 100%. Reduza a margem ou taxas."
      );
    }

    const suggestedPrice = roundMoney(base / divisor);
    const commission = roundMoney(suggestedPrice * (input.commissionPercent / 100));
    const tax = roundMoney(suggestedPrice * (input.taxPercent / 100));
    const netProfitCorrect = roundMoney(
      suggestedPrice -
        input.productCost -
        input.packaging -
        input.sellerShipping -
        input.fixedFee -
        commission -
        tax
    );

    return {
      productCost: input.productCost,
      packaging: input.packaging,
      sellerShipping: input.sellerShipping,
      fixedFee: input.fixedFee,
      commission,
      tax,
      netProfit: netProfitCorrect,
      profitPercent:
        suggestedPrice > 0
          ? roundMoney((netProfitCorrect / suggestedPrice) * 100)
          : 0,
      suggestedPrice,
    };
  }

  const P = input.salePrice ?? 0;
  if (P <= 0) {
    throw new Error("Informe um preço de venda válido.");
  }

  const commission = roundMoney(P * (input.commissionPercent / 100));
  const tax = roundMoney(P * (input.taxPercent / 100));
  const netProfit = roundMoney(
    P -
      input.productCost -
      input.packaging -
      input.sellerShipping -
      input.fixedFee -
      commission -
      tax
  );

  return {
    productCost: input.productCost,
    packaging: input.packaging,
    sellerShipping: input.sellerShipping,
    fixedFee: input.fixedFee,
    commission,
    tax,
    netProfit,
    profitPercent: P > 0 ? roundMoney((netProfit / P) * 100) : 0,
    suggestedPrice: P,
  };
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
