/**
 * Parser determinista de extractos de CaixaBank en PDF.
 * Los movimientos nunca salen del servidor: nada de IA aquí.
 *
 * Formato típico de línea (tras extraer el texto del PDF):
 *   dd/mm/yyyy [dd/mm/yyyy] CONCEPTO ... -1.234,56 [12.345,67]
 * (fecha operación, fecha valor opcional, importe y saldo opcionales al final)
 */

export type ParsedMovement = {
  date: string; // ISO YYYY-MM-DD
  description: string;
  amount: number; // siempre positivo
  type: "expense" | "income";
};

const DATE_RE = /\b(\d{2})[/-](\d{2})[/-](\d{4})\b/g;
const AMOUNT_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}\b/g;

function parseSpanishAmount(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

function toIsoDate(d: string, m: string, y: string): string {
  return `${y}-${m}-${d}`;
}

export function parseCaixabankText(text: string): ParsedMovement[] {
  const movements: ParsedMovement[] = [];

  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 10) continue;

    const dates = [...line.matchAll(DATE_RE)];
    if (dates.length === 0) continue;
    const amounts = [...line.matchAll(AMOUNT_RE)];
    if (amounts.length === 0) continue;

    // Importe: si hay ≥2 cantidades al final, la penúltima es el importe y la
    // última el saldo. Con una sola, esa es el importe.
    const amountMatch =
      amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
    const value = parseSpanishAmount(amountMatch[0]);
    if (!value || Math.abs(value) > 1_000_000) continue;

    // Descripción: lo que queda entre la última fecha y el primer importe
    const lastDate = dates[dates.length - 1];
    const descStart = (lastDate.index ?? 0) + lastDate[0].length;
    const descEnd = amountMatch.index ?? line.length;
    const description = line
      .slice(descStart, descEnd)
      .replace(/\s+/g, " ")
      .trim();
    if (!description) continue;

    const [, d, m, y] = dates[0];
    movements.push({
      date: toIsoDate(d, m, y),
      description,
      amount: Math.abs(value),
      type: value < 0 ? "expense" : "income",
    });
  }

  return movements;
}

/** Clave de deduplicación estable: fecha + importe + concepto normalizado. */
export function dedupHash(
  date: string,
  amount: number,
  description: string
): string {
  const norm = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${date}|${amount.toFixed(2)}|${norm}`.slice(0, 200);
}

/** Patrón de aprendizaje para category_rules a partir de un concepto. */
export function rulePattern(description: string): string {
  const norm = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0-9]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return norm.split(" ").slice(0, 3).join(" ").slice(0, 40);
}
