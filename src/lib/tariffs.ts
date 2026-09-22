export type TariffMode = "manual" | "ml_drop_off";
export const mlDropOffRule = {
  id: "mlb-me2-drop-off-fixed-2026-09-22",
  label: "Mercado Livre · envio em agência (ME2 Drop Off)",
  effectiveFrom: "2026-03-02",
  checkedAt: "2026-09-22",
  reviewBy: "2026-09-29",
  source: "https://developers.mercadolivre.com.br/pt_br/comissao-por-vender",
  fixedFee: 0,
} as const;

export function isRuleCurrent(date: Date = new Date()): boolean {
  const instant = date.getTime();
  return (
    Number.isFinite(instant) &&
    instant >= Date.parse(`${mlDropOffRule.effectiveFrom}T00:00:00-03:00`) &&
    instant < Date.parse(`${mlDropOffRule.reviewBy}T00:00:00-03:00`)
  );
}

export function resolveFixedFee(
  mode: TariffMode,
  manualFee: number,
  confirmedDropOff: boolean,
  date = new Date(),
): { amount: number; ruleId: string } {
  if (mode === "manual") return { amount: manualFee, ruleId: "manual-v1" };
  if (!confirmedDropOff)
    throw new Error(
      "Confirme que o anúncio usa ME2 Drop Off, sem Flex ou outra logística.",
    );
  if (!isRuleCurrent(date))
    throw new Error(
      "Esta regra precisa de nova conferência. Use o modo manual com as tarifas atuais da sua conta.",
    );
  return { amount: mlDropOffRule.fixedFee, ruleId: mlDropOffRule.id };
}
