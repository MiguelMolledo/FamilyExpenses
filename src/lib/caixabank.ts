/**
 * Parsers deterministas de extractos de CaixaBank (PDF y Excel).
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

const normCell = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/**
 * Parser de los exports Excel de CaixaBank (.xls). Hay dos formatos:
 * - Corto (rangos recientes): Fecha | Fecha valor | Movimiento | Más datos | Importe.
 * - Largo (rangos amplios): Número de cuenta | Oficina | ... | Ingreso (+) |
 *   Gasto (-) | Saldos | Conceptos complementarios 1-10. De este solo se
 *   extraen fecha, concepto e importe; cuenta, saldos y referencias se descartan.
 */
export function parseCaixabankSheet(rows: unknown[][]): ParsedMovement[] {
  return parseShortSheet(rows) ?? parseFullSheet(rows) ?? [];
}

function parseShortSheet(rows: unknown[][]): ParsedMovement[] | null {
  const norm = normCell;
  const headerIdx = rows.findIndex(
    (r) => r.some((c) => norm(c) === "fecha") && r.some((c) => norm(c) === "importe")
  );
  if (headerIdx === -1) return null;

  const header = rows[headerIdx].map(norm);
  const col = {
    date: header.indexOf("fecha"),
    description: header.indexOf("movimiento"),
    extra: header.indexOf("mas datos"),
    amount: header.indexOf("importe"),
  };
  if (col.description === -1 || col.amount === -1) return null;

  const movements: ParsedMovement[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const value = row[col.amount];
    const description = String(row[col.description] ?? "").replace(/\s+/g, " ").trim();
    if (typeof value !== "number" || !value || !description) continue;

    // "Más datos" suele traer la fecha real de la compra en pagos con tarjeta:
    // "Fecha de operación: dd-mm-yyyy". Si está, manda sobre la fecha contable.
    const extra = String(row[col.extra] ?? "");
    const opDate = extra.match(/operaci[oó]n:?\s*(\d{2})-(\d{2})-(\d{4})/i);
    const date = opDate
      ? toIsoDate(opDate[1], opDate[2], opDate[3])
      : excelDateToIso(row[col.date]);
    if (!date) continue;

    movements.push({
      date,
      description,
      amount: Math.abs(value),
      type: value < 0 ? "expense" : "income",
    });
  }
  return movements;
}

const OP_DATE_RE = /fecha de operaci[oó]n:?\s*(\d{2})-(\d{2})-(\d{4})/i;

function parseFullSheet(rows: unknown[][]): ParsedMovement[] | null {
  const norm = normCell;
  const headerIdx = rows.findIndex(
    (r) =>
      r.some((c) => norm(c) === "f. operacion") &&
      r.some((c) => norm(c) === "ingreso (+)")
  );
  if (headerIdx === -1) return null;

  const header = rows[headerIdx].map(norm);
  const col = {
    date: header.indexOf("f. operacion"),
    income: header.indexOf("ingreso (+)"),
    expense: header.indexOf("gasto (-)"),
    concept: header.indexOf("concepto complementario 1"),
    operation: header.indexOf("concepto complementario 9"),
  };
  if (col.income === -1 || col.expense === -1 || col.concept === -1) return null;

  const movements: ParsedMovement[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    // Solo gastos: los ingresos de este formato no se importan
    const expense = row[col.expense];
    const isExpense = typeof expense === "number" && expense !== 0;
    if (!isExpense) continue;

    const concept = String(row[col.concept] ?? "");
    // En tarjeta, el concepto trae la fecha real de la compra como prefijo;
    // manda sobre la contable y se quita de la descripción.
    const opDate = concept.match(OP_DATE_RE);
    const date = opDate
      ? toIsoDate(opDate[1], opDate[2], opDate[3])
      : excelDateToIso(row[col.date]);
    if (!date) continue;

    // Descripción sin referencias: fuera cualquier token con 6+ dígitos
    // (contratos, pólizas, recibos) — es lo único que sale hacia la IA.
    let description = concept
      .replace(OP_DATE_RE, "")
      .split(/\s+/)
      .filter((t) => (t.match(/\d/g)?.length ?? 0) < 6)
      .join(" ")
      .trim();
    if (!description) {
      // Sin comercio/beneficiario: etiqueta del tipo de operación
      // ("04400069PRS  VTO. PRESTAMO" → "VTO. PRESTAMO")
      description = String(row[col.operation] ?? "")
        .trim()
        .replace(/^\S+\s+/, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (!description) continue;

    movements.push({
      date,
      description,
      amount: Math.abs(expense),
      type: "expense",
    });
  }
  return movements;
}

/** Serial de fecha de Excel (o texto dd/mm/yyyy) → ISO, null si no lo es. */
function excelDateToIso(cell: unknown): string | null {
  if (typeof cell === "number" && cell > 25569 && cell < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + cell * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  const m = String(cell ?? "").match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return m ? toIsoDate(m[1], m[2], m[3]) : null;
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
