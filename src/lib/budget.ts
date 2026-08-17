import type { SupabaseClient as SupabaseClientBase } from "@supabase/supabase-js";
import type {
  Category,
  RecurringIncome,
  Subcategory,
  Transaction,
} from "@/lib/types";

// Los clientes de la app usan el schema `family`, no el genérico `public`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = SupabaseClientBase<any, "family", "family", any, any>;

/**
 * Presupuesto mensual efectivo de una categoría: el suyo o, si no tiene,
 * la suma de los de sus subcategorías.
 */
export function effectiveBudget(
  c: Category,
  subcategories: Subcategory[]
): number | null {
  if (c.monthly_budget != null) return Number(c.monthly_budget);
  const subs = subcategories
    .filter((s) => s.category_id === c.id && s.monthly_budget != null)
    .reduce((s, x) => s + Number(x.monthly_budget), 0);
  return subs > 0 ? subs : null;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // día 0 del mes siguiente = último día
  return d.toISOString().slice(0, 10);
}

/**
 * Objetivo de ahorro que aplica en un mes: 0 antes del mes de arranque del
 * plan (starts_on null = desde siempre).
 */
export function savingsTargetFor(
  plan: { monthly_target: number; starts_on: string | null } | null,
  month: string
): number {
  if (!plan) return 0;
  if (plan.starts_on && month < `${plan.starts_on.slice(0, 7)}-01`) return 0;
  return Number(plan.monthly_target ?? 0);
}

/** ¿Está la fila (starts_on/ends_on) activa en el mes dado? */
export function activeInMonth(
  row: { starts_on: string; ends_on: string | null },
  month: string
): boolean {
  return row.starts_on <= monthEnd(month) && (!row.ends_on || row.ends_on >= month);
}

export type MonthBudget = {
  month: string;
  expectedIncome: number;
  realIncome: number;
  /** parte recurrente de realIncome: vinculados por su importe real, el resto por el previsto */
  receivedIncome: number;
  /** ingresos sin vincular a recurrente (devoluciones, extras) */
  extraordinaryIncome: number;
  /** referencia del mes: suma de presupuestos por categoría + objetivo de ahorro */
  budgeted: number;
  savingsTarget: number;
  realExpenses: number;
  /** Gastos variables del mes (no marcados como recibo fijo, sin traspasos) */
  extraExpenses: number;
  carryover: number;
  /** ingresos del mes − gasto real − objetivo de ahorro + arrastre */
  available: number;
  recurringIncomes: RecurringIncome[];
  transactions: Transaction[];
  closed: boolean;
  /** el mes anterior tiene cierre: si no, el arrastre de este mes es 0 */
  prevClosed: boolean;
  /** el mes anterior tiene movimientos (para no avisar antes del primer mes) */
  prevHasActivity: boolean;
};

/**
 * Resumen del mes. Solo cuenta lo real: el gasto ataca al disponible cuando
 * el movimiento existe, nunca por adelantado. El presupuesto por categoría es
 * la referencia de lo previsto; no se descuenta nada que no haya pasado.
 */
export async function getMonthBudget(
  supabase: SupabaseClient,
  month: string
): Promise<MonthBudget> {
  // Materializa los movimientos automáticos pendientes (derrama, etc.) de
  // TODOS los meses hasta hoy antes de leer — así da igual cuánto lleve la
  // app sin abrirse. Import diferido para no crear un ciclo de módulos.
  const { ensureAutoMovements } = await import("@/lib/auto-movements");
  await ensureAutoMovements(supabase);

  const end = monthEnd(month);
  const prevMonth = addMonths(month, -1);
  const [
    incomesQ,
    txQ,
    planQ,
    closureQ,
    prevClosureQ,
    categoriesQ,
    subsQ,
    prevTxQ,
  ] = await Promise.all([
      supabase
        .from("recurring_incomes")
        .select("*")
        .lte("starts_on", end)
        .or(`ends_on.is.null,ends_on.gte.${month}`)
        .order("name"),
      supabase
        .from("transactions")
        .select("*")
        .gte("date", month)
        .lte("date", end)
        .order("date", { ascending: false }),
      supabase.from("savings_plans").select("*").maybeSingle(),
      supabase.from("month_closures").select("*").eq("month", month).maybeSingle(),
      supabase
        .from("month_closures")
        .select("*")
        .eq("month", prevMonth)
        .maybeSingle(),
      supabase.from("categories").select("*"),
      supabase.from("subcategories").select("*"),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .gte("date", prevMonth)
        .lte("date", monthEnd(prevMonth)),
    ]);

  const recurringIncomes = (incomesQ.data ?? []) as RecurringIncome[];
  const transactions = (txQ.data ?? []).map((t) => ({
    ...t,
    amount: Number(t.amount),
  })) as Transaction[];
  const savingsTarget = savingsTargetFor(planQ.data, month);
  const carryover = Number(prevClosureQ.data?.carryover ?? 0);
  const categories = (categoriesQ.data ?? []) as Category[];
  const subcategories = (subsQ.data ?? []) as Subcategory[];
  // Traspasos entre cuentas propias: fuera de ingresos y gastos
  const excludedCats = new Set(
    categories.filter((c) => c.exclude_from_stats).map((c) => c.id)
  );
  const counted = transactions.filter(
    (t) => !t.category_id || !excludedCats.has(t.category_id)
  );

  const budgeted =
    categories
      .filter((c) => !c.exclude_from_stats)
      .reduce((s, c) => s + (effectiveBudget(c, subcategories) ?? 0), 0) +
    savingsTarget;

  const expectedIncome = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0);

  const extraordinaryIncome = counted
    .filter((t) => t.type === "income" && !t.recurring_income_id)
    .reduce((s, t) => s + t.amount, 0);
  // Ingreso recurrente: si ya llegó (movimiento vinculado), manda el importe
  // real — una nómina con paga variable o atraso no debe contarse al previsto.
  // Si aún no llegó, cuenta el previsto (comportamiento de siempre).
  const linkedByRec = new Map<string, number>();
  for (const t of counted) {
    if (t.type === "income" && t.recurring_income_id) {
      linkedByRec.set(
        t.recurring_income_id,
        (linkedByRec.get(t.recurring_income_id) ?? 0) + t.amount
      );
    }
  }
  const recIds = new Set(recurringIncomes.map((i) => i.id));
  let receivedIncome = recurringIncomes.reduce(
    (s, i) => s + (linkedByRec.get(i.id) ?? Number(i.amount)),
    0
  );
  // Ingresos vinculados a recurrentes ya terminados: cuentan por su importe
  for (const [id, amount] of linkedByRec) {
    if (!recIds.has(id)) receivedIncome += amount;
  }
  const realIncome = receivedIncome + extraordinaryIncome;

  const realExpenses = counted
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const extraExpenses = counted
    .filter((t) => t.type === "expense" && !t.is_fixed)
    .reduce((s, t) => s + t.amount, 0);

  const available = realIncome - realExpenses - savingsTarget + carryover;

  return {
    month,
    expectedIncome,
    realIncome,
    receivedIncome,
    extraordinaryIncome,
    budgeted,
    savingsTarget,
    realExpenses,
    extraExpenses,
    carryover,
    available,
    recurringIncomes,
    transactions,
    closed: !!closureQ.data,
    prevClosed: !!prevClosureQ.data,
    prevHasActivity: (prevTxQ.count ?? 0) > 0,
  };
}

export type CategoryBudgetRow = {
  category: Category;
  /** presupuesto mensual: el de la categoría o, si no tiene, la suma de subcats */
  budget: number | null;
  spent: number;
  fixedSpent: number;
  /** disponible del mes; con rollover 'accumulate' incluye el saldo del año */
  available: number | null;
  /** saldo acumulado del año (solo rollover 'accumulate') */
  accumulated: number | null;
  /** parte prescindible del presupuesto: la categoría entera (is_flexible) o
   * la suma del desglose marcado prescindible */
  prescindibleBudget: number;
  /** gasto del mes en lo prescindible (capacidad de reacción) */
  flexibleSpent: number;
  subRows: { sub: Subcategory; spent: number }[];
};

export type CategoryBudgets = {
  rows: CategoryBudgetRow[];
  /** capacidad de reacción: gasto del mes en lo marcado prescindible */
  flexibleSpent: number;
  totalSpent: number;
};

/**
 * Presupuesto por categoría del mes: gasto real (fijo + variable, todo cuenta)
 * contra el presupuesto de la categoría. Con sobrante 'accumulate' el
 * disponible arrastra el saldo no gastado del año; con 'to_savings' cada mes
 * empieza de cero. Las categorías excluidas (Traspaso) no aparecen.
 */
export async function getCategoryBudgets(
  supabase: SupabaseClient,
  month: string
): Promise<CategoryBudgets> {
  const year = month.slice(0, 4);
  const jan = `${year}-01-01`;
  const end = monthEnd(month);

  const [catsQ, subsQ, txQ] = await Promise.all([
    supabase.from("categories").select("*").order("name"),
    supabase.from("subcategories").select("*").order("name"),
    supabase
      .from("transactions")
      .select("amount, category_id, subcategory_id, date, type, is_fixed")
      .eq("type", "expense")
      .gte("date", jan)
      .lte("date", end),
  ]);

  const categories = ((catsQ.data ?? []) as Category[]).filter(
    (c) => !c.exclude_from_stats
  );
  const subcategories = (subsQ.data ?? []) as Subcategory[];
  const tx = (txQ.data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
  const monthsElapsed = Number(month.slice(5, 7));

  const rows: CategoryBudgetRow[] = categories.map((c) => {
    const subs = subcategories.filter((s) => s.category_id === c.id);
    const budget = effectiveBudget(c, subcategories);

    const inCat = tx.filter((t) => t.category_id === c.id);
    const spent = inCat
      .filter((t) => t.date >= month)
      .reduce((s, t) => s + t.amount, 0);
    const fixedSpent = inCat
      .filter((t) => t.date >= month && t.is_fixed)
      .reduce((s, t) => s + t.amount, 0);
    const ytdSpent = inCat.reduce((s, t) => s + t.amount, 0);

    let available: number | null = null;
    let accumulated: number | null = null;
    if (budget != null) {
      if (c.rollover === "accumulate") {
        // Saldo del año: presupuesto de los meses transcurridos − gasto YTD
        available = budget * monthsElapsed - ytdSpent;
        accumulated = available - (budget - spent);
      } else {
        available = budget - spent;
      }
    }

    const subRows = subs.map((sub) => ({
      sub,
      spent: inCat
        .filter((t) => t.date >= month && t.subcategory_id === sub.id)
        .reduce((s, t) => s + t.amount, 0),
    }));

    // Prescindible: con is_flexible cae la categoría entera; si no, solo lo
    // asignado en el desglose marcado. Lo sin asignar es imprescindible.
    const prescindibleBudget = c.is_flexible
      ? (budget ?? 0)
      : Math.min(
          budget ?? 0,
          subs
            .filter((s) => s.prescindible && s.monthly_budget != null)
            .reduce((s, x) => s + Number(x.monthly_budget), 0)
        );
    const flexibleSpent = c.is_flexible
      ? spent
      : subRows
          .filter(({ sub }) => sub.prescindible)
          .reduce((s, x) => s + x.spent, 0);

    return {
      category: c,
      budget,
      spent,
      fixedSpent,
      available,
      accumulated,
      prescindibleBudget,
      flexibleSpent,
      subRows,
    };
  });

  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const flexibleSpent = rows.reduce((s, r) => s + r.flexibleSpent, 0);

  return { rows, flexibleSpent, totalSpent };
}

export type YearMonthRow = {
  month: string;
  expectedIncome: number;
  budgeted: number; // presupuestos por categoría + ahorro
  realIncome: number;
  realExpenses: number;
};

export type YearOverview = {
  months: YearMonthRow[];
  totals: {
    expectedIncome: number;
    budgeted: number;
    realIncome: number;
    realExpenses: number;
  };
};

/** Vista anual: por cada mes del año, presupuesto vs real. */
export async function getYearOverview(
  supabase: SupabaseClient,
  year: number
): Promise<YearOverview> {
  const jan = `${year}-01-01`;
  const dec31 = `${year}-12-31`;

  const [incomesQ, txQ, planQ, catsQ, subsQ] = await Promise.all([
    supabase
      .from("recurring_incomes")
      .select("*")
      .lte("starts_on", dec31)
      .or(`ends_on.is.null,ends_on.gte.${jan}`),
    supabase
      .from("transactions")
      .select("date, amount, type, recurring_income_id, category_id")
      .gte("date", jan)
      .lte("date", dec31),
    supabase.from("savings_plans").select("*").maybeSingle(),
    supabase.from("categories").select("*"),
    supabase.from("subcategories").select("*"),
  ]);

  const recIncomes = (incomesQ.data ?? []) as RecurringIncome[];
  const categories = (catsQ.data ?? []) as Category[];
  const subcategories = (subsQ.data ?? []) as Subcategory[];
  const excludedCats = new Set(
    categories.filter((c) => c.exclude_from_stats).map((c) => c.id)
  );
  const budgetedBase = categories
    .filter((c) => !c.exclude_from_stats)
    .reduce((s, c) => s + (effectiveBudget(c, subcategories) ?? 0), 0);

  const months: YearMonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}-01`;
    const expectedIncome = recIncomes
      .filter((i) => activeInMonth(i, month))
      .reduce((s, i) => s + Number(i.amount), 0);
    months.push({
      month,
      expectedIncome,
      budgeted: budgetedBase + savingsTargetFor(planQ.data, month),
      realIncome: expectedIncome, // extraordinarios se suman abajo
      realExpenses: 0,
    });
  }

  for (const t of txQ.data ?? []) {
    if (t.category_id && excludedCats.has(t.category_id)) continue;
    const idx = Number(t.date.slice(5, 7)) - 1;
    const row = months[idx];
    if (!row) continue;
    if (t.type === "expense") row.realExpenses += Number(t.amount);
    else if (!t.recurring_income_id) row.realIncome += Number(t.amount);
  }

  // Meses futuros: sin ingresos "reales" todavía
  const totals = months.reduce(
    (acc, r) => ({
      expectedIncome: acc.expectedIncome + r.expectedIncome,
      budgeted: acc.budgeted + r.budgeted,
      realIncome: acc.realIncome + r.realIncome,
      realExpenses: acc.realExpenses + r.realExpenses,
    }),
    { expectedIncome: 0, budgeted: 0, realIncome: 0, realExpenses: 0 }
  );

  return { months, totals };
}
