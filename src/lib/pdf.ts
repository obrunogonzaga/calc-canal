import { jsPDF } from "jspdf";
import type { SimulationSnapshot } from "@/components/Calculator";
import { formatBRL } from "./pricing";

export function downloadBreakdownPdf(snapshot: SimulationSnapshot) {
  const { breakdown: b } = snapshot;
  const doc = new jsPDF();
  doc.setFontSize(22);
  doc.text("Líquido", 16, 22);
  doc.setFontSize(11);
  let y = 35;
  function line(value: string) {
    const lines = doc.splitTextToSize(value, 178) as string[];
    for (const part of lines) {
      if (y > 273) {
        doc.addPage();
        y = 22;
      }
      doc.text(part, 16, y);
      y += 7;
    }
  }
  line(
    `Simulação: ${new Date(snapshot.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (São Paulo)`,
  );
  line(`Canal: ${snapshot.channel}`);
  line(`Preço de venda: ${formatBRL(b.suggestedPrice)}`);
  y += 5;
  for (const [label, value] of [
    ["Produto", b.productCost],
    ["Embalagem", b.packaging],
    ["Frete", b.sellerShipping],
    ["Comissão", b.commission],
    ["Taxa fixa", b.fixedFee],
    ["Imposto", b.tax],
    ["Contribuição estimada", b.netProfit],
  ] as const)
    line(`${label}: ${formatBRL(value)}`);
  line(`Margem sobre a venda: ${b.profitPercent.toLocaleString("pt-BR")}%`);
  y += 6;
  line("Premissas");
  snapshot.assumptions.forEach(line);
  y += 5;
  line(
    "Contribuição estimada não é lucro líquido. Confira as tarifas da sua conta e os custos não incluídos antes de usar o preço sugerido.",
  );
  doc.save("liquido-simulacao.pdf");
}
