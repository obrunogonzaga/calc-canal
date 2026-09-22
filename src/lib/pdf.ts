import { jsPDF } from "jspdf";
import type { PricingBreakdown } from "./pricing";
import { formatBRL } from "./pricing";

export function downloadBreakdownPdf(
  channelLabel: string,
  breakdown: PricingBreakdown
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(18);
  doc.text("CalcCanal — Simulação", 14, 20);
  doc.setFontSize(11);
  doc.text(`Canal: ${channelLabel}`, 14, 30);
  doc.text(`Preço de venda: ${formatBRL(breakdown.suggestedPrice)}`, 14, 38);

  const lines = [
    `Custo do produto: ${formatBRL(breakdown.productCost)}`,
    `Embalagem: ${formatBRL(breakdown.packaging)}`,
    `Frete (seller): ${formatBRL(breakdown.sellerShipping)}`,
    `Comissão: ${formatBRL(breakdown.commission)}`,
    `Taxa fixa: ${formatBRL(breakdown.fixedFee)}`,
    `Imposto: ${formatBRL(breakdown.tax)}`,
    `Lucro líquido: ${formatBRL(breakdown.netProfit)}`,
    `% lucro: ${breakdown.profitPercent.toFixed(2)}%`,
  ];

  let y = 52;
  doc.setFontSize(10);
  for (const line of lines) {
    doc.text(line, 14, y);
    y += 8;
  }

  doc.setTextColor(180, 180, 180);
  doc.setFontSize(36);
  doc.text("CalcCanal", pageWidth / 2, pageHeight / 2, {
    align: "center",
    angle: 45,
  });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text("Versão gratuita — calccanal.com.br", 14, pageHeight - 10);

  doc.save("calccanal-simulacao.pdf");
}
