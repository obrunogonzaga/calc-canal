export type ChannelId = "mercado_livre" | "shopee" | "amazon_br" | "magalu";

export interface ChannelConfig {
  id: ChannelId;
  label: string;
  commissionPercent: number;
  fixedFee: number;
  sourceNote: string;
}
