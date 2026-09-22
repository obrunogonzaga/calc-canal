/**
 * Converte um valor monetário digitado no formato brasileiro para `number`.
 *
 * `1.234` é recusado de propósito: sem a vírgula não é possível saber se o
 * ponto representa milhar ou uma casa decimal inválida. Use `1.234,00` ou
 * `1234` para eliminar a ambiguidade.
 */
export function parseBRNumber(value: string, label = "Valor"): number {
  const field = label.trim() || "Valor";

  if (typeof value !== "string") {
    throw new Error(`${field} deve ser informado.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${field} deve ser informado.`);
  }

  if (trimmed.startsWith("-")) {
    throw new Error(`${field} não pode ser negativo.`);
  }

  const groupedWithDecimal = /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/;
  const groupedInteger = /^\d{1,3}(?:\.\d{3}){2,}$/;
  const commaDecimal = /^\d+(?:,\d{1,2})?$/;
  const dotDecimal = /^\d+\.\d{1,2}$/;

  let normalized: string;

  if (groupedWithDecimal.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (groupedInteger.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "");
  } else if (commaDecimal.test(trimmed)) {
    normalized = trimmed.replace(",", ".");
  } else if (dotDecimal.test(trimmed)) {
    normalized = trimmed;
  } else {
    throw new Error(`${field} deve ser um número válido.`);
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} deve ser um número finito.`);
  }

  return parsed;
}
