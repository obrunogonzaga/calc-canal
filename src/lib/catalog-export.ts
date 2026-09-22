import { escapeCsvCell } from "./catalog-csv";
import type { Product } from "./products";

const heading = [
  "SKU",
  "PRODUTO",
  "CANAL",
  "CUSTO",
  "PRECO_PUBLICADO",
  "PRECO_SUGERIDO",
  "CONTRIBUICAO",
  "MARGEM_PERCENTUAL",
  "REGRA",
  "STATUS",
];
function numberCell(value: number | undefined): string {
  if (value === undefined) return '""';
  if (!Number.isFinite(value)) throw new Error("Valor inválido para exportação.");
  return `"${value.toFixed(2).replace(".", ",")}"`;
}
export function createCatalogExport(products: Product[]): string {
  const records = products.map((product) =>
    [
      escapeCsvCell(product.sku),
      escapeCsvCell(product.name),
      escapeCsvCell(product.channelId),
      numberCell(product.draft.input.productCost),
      numberCell(product.currentPrice),
      numberCell(product.result.suggestedPrice),
      numberCell(product.result.netProfit),
      numberCell(product.result.profitPercent),
      escapeCsvCell(product.ruleId),
      escapeCsvCell(product.archivedAt ? "ARQUIVADO" : "ATIVO"),
    ]
      .join(";"),
  );
  return `\uFEFF${heading.map(escapeCsvCell).join(";")}\r\n${records.join("\r\n")}${records.length ? "\r\n" : ""}`;
}
