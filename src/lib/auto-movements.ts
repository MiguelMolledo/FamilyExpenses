import type { SupabaseClient as SupabaseClientBase } from "@supabase/supabase-js";
import { activeInMonth } from "@/lib/budget";
import { currentMonthStart, type AutoMovement } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = SupabaseClientBase<any, "family", "family", any, any>;

/**
 * Materializa los movimientos automáticos del mes: gastos reales y mensuales
 * que no pasan por la cuenta común (derrama, etc.) y que deben contar sí o sí.
 * Se generan como transacción normal (día 1, is_fixed) al visitar el mes.
 *
 * Idempotente: auto_movement_runs marca los meses ya generados (la marca se
 * reclama ANTES de insertar, así dos cargas simultáneas no duplican), y si el
 * usuario borra el movimiento generado, la marca queda y no reaparece. No se
 * tocan meses futuros ni meses cerrados.
 */
export async function ensureAutoMovements(
  supabase: SupabaseClient,
  month: string
): Promise<void> {
  if (month > currentMonthStart()) return;

  const { data: rules } = await supabase.from("auto_movements").select("*");
  const active = ((rules ?? []) as AutoMovement[]).filter((r) =>
    activeInMonth(r, month)
  );
  if (active.length === 0) return;

  const [closureQ, runsQ] = await Promise.all([
    supabase
      .from("month_closures")
      .select("month")
      .eq("month", month)
      .maybeSingle(),
    supabase
      .from("auto_movement_runs")
      .select("auto_movement_id")
      .eq("month", month),
  ]);
  if (closureQ.data) return;

  const done = new Set((runsQ.data ?? []).map((r) => r.auto_movement_id));
  for (const rule of active) {
    if (done.has(rule.id)) continue;
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
