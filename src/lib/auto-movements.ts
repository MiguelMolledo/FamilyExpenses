import type { SupabaseClient as SupabaseClientBase } from "@supabase/supabase-js";
import { activeInMonth, addMonths } from "@/lib/budget";
import { currentMonthStart, type AutoMovement } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = SupabaseClientBase<any, "family", "family", any, any>;

/**
 * Materializa los movimientos automáticos pendientes: gastos reales y
 * mensuales que no pasan por la cuenta común (derrama, etc.) y que deben
 * contar sí o sí. No hay cron: se ejecuta al cargar cualquier página que
 * calcule un mes, y hace catch-up COMPLETO — genera todos los meses
 * pendientes desde que cada regla empezó hasta el mes actual (cada uno con
 * fecha día 1), da igual cuánto tiempo lleve la app sin abrirse o qué mes se
 * esté mirando.
 *
 * Idempotente: auto_movement_runs marca los meses ya generados (la marca se
 * reclama ANTES de insertar, así dos cargas simultáneas no duplican), y si el
 * usuario borra el movimiento generado, la marca queda y no reaparece. No se
 * tocan meses futuros ni meses cerrados.
 */
export async function ensureAutoMovements(
  supabase: SupabaseClient
): Promise<void> {
  const current = currentMonthStart();
  const { data: rulesQ } = await supabase.from("auto_movements").select("*");
  const rules = (rulesQ ?? []) as AutoMovement[];
  if (rules.length === 0) return;

  // Rango a revisar: del mes de la regla más antigua al mes actual
  const earliest = rules.reduce(
    (a, r) => (r.starts_on < a ? r.starts_on : a),
    current
  );
  const startMonth = `${earliest.slice(0, 7)}-01`;
  const months: string[] = [];
  for (
    let m = startMonth;
    m <= current && months.length < 120;
    m = addMonths(m, 1)
  ) {
    months.push(m);
  }

  const [runsQ, closuresQ] = await Promise.all([
    supabase
      .from("auto_movement_runs")
      .select("auto_movement_id, month")
      .gte("month", startMonth),
    supabase.from("month_closures").select("month").gte("month", startMonth),
  ]);
  const done = new Set(
    (runsQ.data ?? []).map((r) => `${r.auto_movement_id}|${r.month}`)
  );
  const closed = new Set((closuresQ.data ?? []).map((c) => c.month as string));

  for (const month of months) {
    if (closed.has(month)) continue;
    for (const rule of rules) {
      if (!activeInMonth(rule, month)) continue;
      if (done.has(`${rule.id}|${month}`)) continue;
      // Reclamar el mes primero: si otro request llegó antes, PK duplicada y fuera
      const { error: claimError } = await supabase
        .from("auto_movement_runs")
        .insert({ auto_movement_id: rule.id, month });
      if (claimError) continue;
      const { data: tx } = await supabase
        .from("transactions")
        .insert({
          date: month,
          amount: Number(rule.amount),
          type: "expense",
          category_id: rule.category_id,
          subcategory_id: rule.subcategory_id,
          description: rule.name,
          is_fixed: true,
          auto_movement_id: rule.id,
        })
        .select("id")
        .single();
      if (tx) {
        await supabase
          .from("auto_movement_runs")
          .update({ transaction_id: tx.id })
          .eq("auto_movement_id", rule.id)
          .eq("month", month);
      }
    }
  }
}
