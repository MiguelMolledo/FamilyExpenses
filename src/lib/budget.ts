import type { SupabaseClient as SupabaseClientBase } from "@supabase/supabase-js";
import type {
  Category,
  RecurringExpense,
  RecurringIncome,
  Subcategory,
  Transaction,
} from "@/lib/types";

// Los clientes de la app usan el schema `family`, no el genérico `public`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = SupabaseClientBase<any, "family", "family", any, any>;

/** Provisión mensual de un gasto fijo: anual/12, mensual tal cual. */
export function monthlyProvision(e: Pick<RecurringExpense, "amount" | "period">): number {
  return e.period === "annual" ? e.amount / 12 : e.amount;
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
  provisions: number; // fijos + objetivo de ahorro
  savingsTarget: number;
  realExpenses: number;
  /** Gastos variables del mes (no fijos, sin traspasos) */
  extraExpenses: number;
  /**
   * Exceso de los fijos este mes: cuánto ha crecido (o bajado) el sobregasto
   * acumulado del año de las subcategorías cuyo gasto fijo real supera lo
   * provisionado. Positivo = los fijos se han "comido" disponible.
   */
  fixedOverrun: number;
  carryover: number;
  /** ingresos del mes − provisiones − variables − exceso de fijos + carryover */
  available: number;
  recurringExpenses: (RecurringExpense & { provision: number; realSpent: number })[];
  recurringIncomes: RecurringIncome[];
  transactions: Transaction[];
  closed: boolean;
};

export async function getMonthBudget(
  supabase: SupabaseClient,
  month: string
): Promise<MonthBudget> {
  const end = monthEnd(month);
  const prevMonth = addMonths(month, -1);
  // El sobregasto de fijos se mide sobre el acumulado del año, así que el mes
  // anterior solo cuenta si es del mismo año (el fondo se resetea en enero).
  const prevSameYear = prevMonth.slice(0, 4) === month.slice(0, 4);
  const [
    expensesQ,
    incomesQ,
    txQ,
    planQ,
    closureQ,
    prevClosureQ,
    categoriesQ,
    overrunNow,
    overrunPrev,
  ] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("*")
      .lte("starts_on", end)
      .or(`ends_on.is.null,ends_on.gte.${month}`)
      .order("name"),
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
    supabase.from("categories").select("id, exclude_from_stats"),
    getYearOverrun(supabase, month),
    prevSameYear ? getYearOverrun(supabase, prevMonth) : Promise.resolve(0),
  ]);

  const recurringExpensesRaw = (expensesQ.data ?? []) as RecurringExpense[];
  const recurringIncomes = (incomesQ.data ?? []) as RecurringIncome[];
  const transactions = (txQ.data ?? []).map((t) => ({
    ...t,
    amount: Number(t.amount),
  })) as Transaction[];
  const savingsTarget = Number(planQ.data?.monthly_target ?? 0);
  const carryover = Number(prevClosureQ.data?.carryover ?? 0);
  // Traspasos entre cuentas propias: fuera de ingresos y gastos
  const excludedCats = new Set(
    (categoriesQ.data ?? []).filter((c) => c.exclude_from_stats).map((c) => c.id)
  );
  const counted = transactions.filter(
    (t) => !t.category_id || !excludedCats.has(t.category_id)
  );

  // Gasto fijo real por subcategoría (los fijos ya no se enlazan por nombre)
  const spentBySubcat = new Map<string, number>();
  for (const t of counted) {
    if (t.type === "expense" && t.is_fixed && t.subcategory_id) {
      spentBySubcat.set(
        t.subcategory_id,
        (spentBySubcat.get(t.subcategory_id) ?? 0) + t.amount
      );
    }
  }

  const recurringExpenses = recurringExpensesRaw.map((e) => ({
    ...e,
    amount: Number(e.amount),
    provision: monthlyProvision({ amount: Number(e.amount), period: e.period }),
    realSpent: e.subcategory_id ? spentBySubcat.get(e.subcategory_id) ?? 0 : 0,
  }));

  const fixedProvisions = recurringExpenses.reduce((s, e) => s + e.provision, 0);
  const expectedIncome = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0);

  const extraordinaryIncome = counted
    .filter((t) => t.type === "income" && !t.recurring_income_id)
    .reduce((s, t) => s + t.amount, 0);
  const realIncome = expectedIncome + extraordinaryIncome;

  const realExpenses = counted
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const extraExpenses = counted
    .filter((t) => t.type === "expense" && !t.is_fixed)
    .reduce((s, t) => s + t.amount, 0);

  const provisions = fixedProvisions + savingsTarget;
  // Exceso de fijos: lo que ha crecido este mes el sobregasto acumulado del
  // año. Así el gas de invierno tira primero del colchón provisionado y solo
  // resta disponible cuando el fondo de la subcategoría se agota.
  const fixedOverrun = overrunNow - overrunPrev;
  const available =
    realIncome - provisions - extraExpenses - fixedOverrun + carryover;

  return {
    month,
    expectedIncome,
    realIncome,
    provisions,
    savingsTarget,
    realExpenses,
    extraExpenses,
    fixedOverrun,
    carryover,
    available,
    recurringExpenses,
    recurringIncomes,
    transactions,
    closed: !!closureQ.data,
  };
}

/**
 * Sobregasto acumulado del año hasta `month`: suma, por subcategoría con
 * fijos, de max(0, gasto fijo real YTD − provisionado YTD).
 */
export async function getYearOverrun(
  supabase: SupabaseClient,
  month: string
): Promise<number> {
  const deviations = await getYearDeviations(supabase, month);
  return deviations.reduce((s, d) => s + Math.max(0, -d.deviation), 0);
}

export type ConceptDeviation = {
  name: string;
  provisionYtd: number;
  realYtd: number;
  /** positivo = reservado de más; negativo = te quedas corto */
  deviation: number;
};

/**
 * Desviación acumulada del año por subcategoría con fijos: provisiones de
 * enero a `month` vs gasto real marcado como fijo en esa subcategoría.
 */
export async function getYearDeviations(
  supabase: SupabaseClient,
  month: string
): Promise<ConceptDeviation[]> {
  const year = month.slice(0, 4);
  const jan = `${year}-01-01`;
  const end = monthEnd(month);

  const [expensesQ, txQ, subsQ, catsQ] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("*")
      .lte("starts_on", end)
      .or(`ends_on.is.null,ends_on.gte.${jan}`),
    supabase
      .from("transactions")
      .select("amount, subcategory_id, date, type")
      .eq("type", "expense")
      .eq("is_fixed", true)
      .not("subcategory_id", "is", null)
      .gte("date", jan)
      .lte("date", end),
    supabase.from("subcategories").select("id, name, category_id"),
    supabase.from("categories").select("id, name"),
  ]);

  const rows = (expensesQ.data ?? []) as RecurringExpense[];
  const catName = new Map((catsQ.data ?? []).map((c) => [c.id, c.name]));
  const subLabel = new Map(
    (subsQ.data ?? []).map((s) => [
      s.id,
      `${catName.get(s.category_id) ?? "?"} › ${s.name}`,
    ])
  );
  // key = subcategory_id ("(sin subcategoría)" agrupa los fijos sin asignar)
  const result = new Map<string, ConceptDeviation>();
  const entryFor = (key: string) => {
    let e = result.get(key);
    if (!e) {
      e = {
        name: subLabel.get(key) ?? "Sin subcategoría",
        provisionYtd: 0,
        realYtd: 0,
        deviation: 0,
      };
      result.set(key, e);
    }
    return e;
  };

  // Provisiones: por cada mes del año hasta `month`, suma la provisión de las
  // versiones activas ese mes, agrupada por subcategoría del fijo.
  for (let m = jan.slice(0, 8) + "01"; m <= month; m = addMonths(m, 1)) {
    for (const r of rows) {
      if (!activeInMonth(r, m)) continue;
      entryFor(r.subcategory_id ?? "none").provisionYtd += monthlyProvision({
        amount: Number(r.amount),
        period: r.period,
      });
    }
  }

  for (const t of txQ.data ?? []) {
    const entry = result.get(t.subcategory_id!);
    if (!entry) continue; // gasto fijo en subcat sin fijos dados de alta
    entry.realYtd += Number(t.amount);
  }

  for (const entry of result.values()) {
    entry.deviation = entry.provisionYtd - entry.realYtd;
  }
  return [...result.values()].sort((a, b) => a.deviation - b.deviation);
}

export type Suggestion = {
  name: string;
  currentAnnual: number;
  estimatedAnnual: number;
  monthsCovered: number;
};

/**
 * Sugerencias de ajuste por subcategoría: gasto fijo real de los últimos 12
 * meses anualizado vs importe anual de los fijos de esa subcategoría. Solo
 * con ≥3 meses de histórico y >10% de diferencia.
 */
export async function getSuggestions(
  supabase: SupabaseClient,
  month: string
): Promise<Suggestion[]> {
  const from = addMonths(month, -11);
  const end = monthEnd(month);

  const [expensesQ, txQ, subsQ, catsQ] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("*")
      .lte("starts_on", end)
      .or(`ends_on.is.null,ends_on.gte.${month}`),
    supabase
      .from("transactions")
      .select("amount, subcategory_id, date")
      .eq("type", "expense")
      .eq("is_fixed", true)
      .not("subcategory_id", "is", null)
      .gte("date", from)
      .lte("date", end),
    supabase.from("subcategories").select("id, name, category_id"),
    supabase.from("categories").select("id, name"),
  ]);

  const active = (expensesQ.data ?? []) as RecurringExpense[];
  const catName = new Map((catsQ.data ?? []).map((c) => [c.id, c.name]));
  const subLabel = new Map(
    (subsQ.data ?? []).map((s) => [
      s.id,
      `${catName.get(s.category_id) ?? "?"} › ${s.name}`,
    ])
  );

  const realBySub = new Map<string, number>();
  const monthsBySub = new Map<string, Set<string>>();
  for (const t of txQ.data ?? []) {
    const id = t.subcategory_id!;
    realBySub.set(id, (realBySub.get(id) ?? 0) + Number(t.amount));
    const set = monthsBySub.get(id) ?? new Set<string>();
    set.add(t.date.slice(0, 7));
    monthsBySub.set(id, set);
  }

  // Fijos agrupados por subcategoría: se compara el conjunto
  const bySub = new Map<string, RecurringExpense[]>();
  for (const e of active) {
    if (!e.subcategory_id) continue;
    bySub.set(e.subcategory_id, [...(bySub.get(e.subcategory_id) ?? []), e]);
  }

  const suggestions: Suggestion[] = [];
  for (const [subId, group] of bySub) {
    const real = realBySub.get(subId) ?? 0;
    if (real === 0) continue;
    const oldestStart = group
      .map((e) => e.starts_on)
      .sort()[0]
      .slice(0, 7) + "-01";
    const covered = Math.min(12, monthsBetween(oldestStart, month) + 1);
    if (covered < 3) continue;
    const estimatedAnnual = (real / covered) * 12;
    const currentAnnual = group.reduce(
      (s, e) =>
        s + (e.period === "annual" ? Number(e.amount) : Number(e.amount) * 12),
      0
    );
    if (
      currentAnnual > 0 &&
      Math.abs(estimatedAnnual - currentAnnual) / currentAnnual > 0.1
    ) {
      suggestions.push({
        name: subLabel.get(subId) ?? "Sin subcategoría",
        currentAnnual,
        estimatedAnnual,
        monthsCovered: covered,
      });
    }
  }
  return suggestions;
}

function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
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
  subRows: { sub: Subcategory; spent: number }[];
};

export type CategoryBudgets = {
  rows: CategoryBudgetRow[];
  /** capacidad de reacción: gasto del mes en categorías recortables */
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
    const subBudgets = subs.reduce(
      (s, x) => s + (x.monthly_budget != null ? Number(x.monthly_budget) : 0),
      0
    );
    const budget =
      c.monthly_budget != null
        ? Number(c.monthly_budget)
        : subBudgets > 0
          ? subBudgets
          : null;

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

    return {
      category: c,
      budget,
      spent,
      fixedSpent,
      available,
      accumulated,
      subRows: subs.map((sub) => ({
        sub,
        spent: inCat
          .filter((t) => t.date >= month && t.subcategory_id === sub.id)
          .reduce((s, t) => s + t.amount, 0),
      })),
    };
  });

  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const flexibleSpent = rows
    .filter((r) => r.category.is_flexible)
    .reduce((s, r) => s + r.spent, 0);

  return { rows, flexibleSpent, totalSpent };
}

export type YearMonthRow = {
  month: string;
  expectedIncome: number;
  provisions: number; // fijos + ahorro
  realIncome: number;
  realExpenses: number;
};

export type YearOverview = {
  months: YearMonthRow[];
  totals: {
    expectedIncome: number;
    provisions: number;
    realIncome: number;
    realExpenses: number;
  };
};

/** Vista anual: por cada mes del año, previsto vs real. */
export async function getYearOverview(
  supabase: SupabaseClient,
  year: number
): Promise<YearOverview> {
  const jan = `${year}-01-01`;
  const dec31 = `${year}-12-31`;

  const [expensesQ, incomesQ, txQ, planQ, catsQ] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("*")
      .lte("starts_on", dec31)
      .or(`ends_on.is.null,ends_on.gte.${jan}`),
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
    supabase.from("categories").select("id, exclude_from_stats"),
  ]);

  const recExpenses = (expensesQ.data ?? []) as RecurringExpense[];
  const recIncomes = (incomesQ.data ?? []) as RecurringIncome[];
  const savingsTarget = Number(planQ.data?.monthly_target ?? 0);
  const excludedCats = new Set(
    (catsQ.data ?? []).filter((c) => c.exclude_from_stats).map((c) => c.id)
  );

  const months: YearMonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}-01`;
    const provisions =
      recExpenses
        .filter((e) => activeInMonth(e, month))
        .reduce(
          (s, e) =>
            s + monthlyProvision({ amount: Number(e.amount), period: e.period }),
          0
        ) + savingsTarget;
    const expectedIncome = recIncomes
      .filter((i) => activeInMonth(i, month))
      .reduce((s, i) => s + Number(i.amount), 0);
    months.push({
      month,
      expectedIncome,
      provisions,
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
      provisions: acc.provisions + r.provisions,
      realIncome: acc.realIncome + r.realIncome,
      realExpenses: acc.realExpenses + r.realExpenses,
    }),
    { expectedIncome: 0, provisions: 0, realIncome: 0, realExpenses: 0 }
  );

  return { months, totals };
}
