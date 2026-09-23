import { calculatePricing, type PricingInput } from "./pricing";
import { resolveFixedFee, type TariffMode } from "./tariffs";
import type { ChannelId } from "@/types/channels";

// Keep the legacy key so an in-progress simulation survives the rebrand.
export const DRAFT_KEY = "precopronto:pending-simulation:v1";
export interface SimulationDraft {
  version: 1;
  channelId: ChannelId;
  input: PricingInput;
  tariffMode: TariffMode;
  confirmedDropOff: boolean;
  excludeTax: boolean;
}
const channels = new Set(["mercado_livre", "shopee", "amazon_br", "magalu"]);
export function validateDraft(value: unknown): SimulationDraft {
  if (!value || typeof value !== "object")
    throw new Error("Simulação inválida. Faça uma nova conta.");
  const draft = value as Partial<SimulationDraft>;
  if (
    draft.version !== 1 ||
    !channels.has(draft.channelId ?? "") ||
    !draft.input ||
    typeof draft.input !== "object" ||
    !["manual", "ml_drop_off"].includes(draft.tariffMode ?? "") ||
    typeof draft.confirmedDropOff !== "boolean" ||
    typeof draft.excludeTax !== "boolean"
  )
    throw new Error("Simulação inválida. Faça uma nova conta.");
  if (draft.tariffMode === "ml_drop_off" && draft.channelId !== "mercado_livre")
    throw new Error("A regra de logística não corresponde ao canal.");
  const input = draft.input;
  // Rebuild an allowlisted object: do not persist client-supplied totals or extra keys.
  const cleaned: PricingInput = {
    productCost: input.productCost,
    packaging: input.packaging,
    sellerShipping: input.sellerShipping,
    desiredMarginPercent: input.desiredMarginPercent,
    taxPercent: draft.excludeTax ? 0 : input.taxPercent,
    commissionPercent: input.commissionPercent,
    fixedFee: input.fixedFee,
    mode: input.mode,
    ...(input.mode === "price_to_profit" ? { salePrice: input.salePrice } : {}),
  };
  cleaned.fixedFee = resolveFixedFee(
    draft.tariffMode as TariffMode,
    cleaned.fixedFee,
    draft.confirmedDropOff,
  ).amount;
  calculatePricing(cleaned);
  return {
    version: 1,
    channelId: draft.channelId as ChannelId,
    input: cleaned,
    tariffMode: draft.tariffMode as TariffMode,
    confirmedDropOff: draft.confirmedDropOff,
    excludeTax: draft.excludeTax,
  };
}
