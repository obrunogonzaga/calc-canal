import { parseBRNumber } from "./numbers";

export interface CsvProductRow {
  line: number;
  sku: string;
  name: string;
  cost: number | null;
  quantity: number | null;
  desiredMarginPercent: number | null;
  errors: string[];
}
export interface CsvPreview {
  delimiter: ";" | ",";
  rows: CsvProductRow[];
  validCount: number;
  invalidCount: number;
}
export const MAX_CSV_BYTES = 2_000_000;
export const MAX_CSV_PRODUCTS = 500;
function headerKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
function readRecords(
  source: string,
  delimiter: ";" | ",",
): { cells: string[]; line: number }[] {
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;
  let rowStarted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        cell += char;
        if (char === "\n") line++;
      }
      continue;
    }
    if (char === '"') {
      if (cell !== "" || afterQuote)
        throw new Error(`Aspas inválidas na linha ${line}.`);
      quoted = true;
      rowStarted = true;
      continue;
    }
    if (afterQuote && char !== delimiter && char !== "\n" && char !== "\r") {
      throw new Error(`Conteúdo após aspas na linha ${line}.`);
    }
    if (char === delimiter) {
      cells.push(cell);
      cell = "";
      afterQuote = false;
      rowStarted = true;
      continue;
    }
    if (char === "\r" && source[i + 1] === "\n") continue;
    if (char === "\n" || char === "\r") {
      if (rowStarted || cell.trim() || cells.length)
        records.push({ cells: [...cells, cell], line: recordLine });
      cells = [];
      cell = "";
      afterQuote = false;
      rowStarted = false;
      line++;
      recordLine = line;
      continue;
    }
    if (afterQuote) throw new Error(`Conteúdo após aspas na linha ${line}.`);
    cell += char;
    rowStarted = true;
  }
  if (quoted) throw new Error(`Aspas sem fechamento na linha ${recordLine}.`);
  if (rowStarted || cell.trim() || cells.length)
    records.push({ cells: [...cells, cell], line: recordLine });
  return records;
}
function columnIndex(header: string[], aliases: string[]): number {
  return header.findIndex((value) => aliases.includes(headerKey(value)));
}
function optionalNumber(text: string, label: string): number | null {
  return text.trim() === "" ? null : parseBRNumber(text, label);
}
export function parseCatalogCsv(text: string): CsvPreview {
  if (typeof text !== "string" || !text.trim())
    throw new Error("Selecione um CSV com cabeçalho e produtos.");
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES)
    throw new Error("O CSV pode ter no máximo 2 MB.");
  if (text.includes("\0") || text.includes("\uFFFD"))
    throw new Error(
      "Arquivo CSV inválido. Exporte em UTF-8 e tente novamente.",
    );
  const clean = text.replace(/^\uFEFF/, "");
  let parsed: ReturnType<typeof readRecords> | undefined;
  let delimiter: ";" | "," = ";";
  const headerText = clean.slice(
    0,
    clean.indexOf("\n") < 0 ? clean.length : clean.indexOf("\n"),
  );
  for (const candidate of [";", ","] as const) {
    const headerCandidate = readRecords(headerText, candidate);
    if (
      headerCandidate.length &&
      columnIndex(headerCandidate[0].cells, ["SKU"]) >= 0 &&
      columnIndex(headerCandidate[0].cells, ["PRODUTO", "NOME"]) >= 0 &&
      columnIndex(headerCandidate[0].cells, ["CUSTO", "CUSTO UNITARIO", "CUSTO UNIT"]) >= 0
    ) {
      parsed = readRecords(clean, candidate);
      delimiter = candidate;
      break;
    }
  }
  if (!parsed)
    throw new Error(
      "Cabeçalho obrigatório: SKU, PRODUTO e CUSTO. Use vírgula ou ponto e vírgula como separador.",
    );
  const header = parsed[0].cells;
  const indexes = {
    sku: columnIndex(header, ["SKU"]),
    name: columnIndex(header, ["PRODUTO", "NOME"]),
    cost: columnIndex(header, ["CUSTO", "CUSTO UNITARIO", "CUSTO UNIT"]),
    quantity: columnIndex(header, ["QTDE", "QUANTIDADE"]),
    margin: columnIndex(header, ["MARGEM", "MARGEM ALVO", "MARGEM DESEJADA"]),
  };
  if (parsed.length - 1 > MAX_CSV_PRODUCTS)
    throw new Error(
      `Importe no máximo ${MAX_CSV_PRODUCTS} produtos por arquivo.`,
    );
  const seen = new Map<string, number>();
  const rows = parsed.slice(1).map(({ cells, line }): CsvProductRow => {
    const errors: string[] = [];
    if (cells.length !== header.length)
      errors.push(`Linha ${line}: número de colunas diferente do cabeçalho.`);
    const sku = (cells[indexes.sku] ?? "").trim();
    const name = (cells[indexes.name] ?? "").trim();
    if (!sku || sku.length > 64)
      errors.push(`Linha ${line}: SKU obrigatório, com até 64 caracteres.`);
    if (!name || name.length > 160)
      errors.push(`Linha ${line}: nome obrigatório, com até 160 caracteres.`);
    const normalizedSku = sku.toLocaleLowerCase("pt-BR");
    if (sku && seen.has(normalizedSku))
      errors.push(
        `Linha ${line}: SKU repetido na linha ${seen.get(normalizedSku)}.`,
      );
    else if (sku) seen.set(normalizedSku, line);
    let cost: number | null = null;
    let quantity: number | null = null;
    let desiredMarginPercent: number | null = null;
    try {
      cost = parseBRNumber(cells[indexes.cost] ?? "", "Custo");
    } catch {
      errors.push(`Linha ${line}: custo inválido. Use um valor em reais.`);
    }
    if (indexes.quantity >= 0) {
      try {
        quantity = optionalNumber(cells[indexes.quantity] ?? "", "Quantidade");
        if (quantity !== null && (!Number.isInteger(quantity) || quantity <= 0))
          throw new Error("Quantidade inválida.");
      } catch {
        errors.push(
          `Linha ${line}: quantidade deve ser inteira e maior que zero.`,
        );
      }
    }
    if (indexes.margin >= 0) {
      try {
        desiredMarginPercent = optionalNumber(
          cells[indexes.margin] ?? "",
          "Margem",
        );
        if (desiredMarginPercent !== null && desiredMarginPercent >= 100)
          throw new Error("Margem inválida.");
      } catch {
        errors.push(`Linha ${line}: margem deve ficar entre 0% e 100%.`);
      }
    }
    return { line, sku, name, cost, quantity, desiredMarginPercent, errors };
  });
  return {
    delimiter,
    rows,
    validCount: rows.filter((row) => row.errors.length === 0).length,
    invalidCount: rows.filter((row) => row.errors.length > 0).length,
  };
}
export function escapeCsvCell(value: string): string {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function createCatalogTemplate(): string {
  return "\uFEFFSKU;PRODUTO;CUSTO;QTDE;MARGEM\r\n";
}
