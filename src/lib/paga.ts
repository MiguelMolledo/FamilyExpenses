import { activeInMonth, addMonths } from "@/lib/budget";
import type { PersonalAllowance, PersonalMovement } from "@/lib/types";

/**
 * Paga devengada hasta `month` incluido: mes a mes, suma de las versiones
 * activas. El mes en curso devenga completo desde el día 1.
 */
export function accruedAllowance(
  rows: PersonalAllowance[],
  month: string
): number {
  if (rows.length === 0) return 0;
  let first = rows[0].starts_on;
  for (const r of rows) if (r.starts_on < first) first = r.starts_on;
  let total = 0;
  for (let m = first.slice(0, 7) + "-01"; m <= month; m = addMonths(m, 1)) {
    for (const r of rows) {
      if (activeInMonth(r, m)) total += Number(r.amount);
    }
  }
  return total;
}

/** Importe mensual vigente en `month` (0 si no hay versión activa). */
export function currentAllowance(
  rows: PersonalAllowance[],
  month: string
): number {
  return rows
    .filter((r) => activeInMonth(r, month))
    .reduce((s, r) => s + Number(r.amount), 0);
}

export type PersonalPot = {
  /** paga mensual vigente */
  monthly: number;
  /** devengado desde el inicio (incluye el mes en curso) */
  accrued: number;
  /** devengado + movimientos (gastos en negativo) */
  balance: number;
  /** gastado en el mes en curso */
  spentThisMonth: number;
};

export function buildPot(
  allowances: PersonalAllowance[],
  movements: PersonalMovement[],
  month: string
): PersonalPot {
  const accrued = accruedAllowance(allowances, month);
  const moved = movements.reduce((s, m) => s + Number(m.amount), 0);
  const spentThisMonth = movements
    .filter((m) => m.kind === "expense" && m.date.slice(0, 7) === month.slice(0, 7))
    .reduce((s, m) => s - Number(m.amount), 0);
  return {
    monthly: currentAllowance(allowances, month),
    accrued,
    balance: accrued + moved,
    spentThisMonth,
  };
}
