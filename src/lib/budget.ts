import type { SupabaseClient as SupabaseClientBase } from "@supabase/supabase-js";
import type {
  RecurringExpense,
  RecurringIncome,
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
  /** Gastos reales NO ligados a un fijo (extras del mes) */
  extraExpenses: number;
  /**
   * Exceso de los fijos este mes: cuánto ha crecido (o bajado) el sobregasto
   * acumulado del año de los conceptos cuyo gasto real supera lo provisionado.
   * Positivo = los fijos se han "comido" disponible; negativo = recuperas
   * exceso de meses anteriores.
   */
  fixedOverrun: number;
  carryover: number;
  /** ingresos del mes − provisiones − extras − exceso de fijos + carryover */
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
  const [expensesQ, incomesQ, txQ, planQ, closureQ, prevClosureQ, overrunNow, overrunPrev] =
    await Promise.all([
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

  const spentByRecurring = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === "expense" && t.recurring_expense_id) {
      spentByRecurring.set(
        t.recurring_expense_id,
        (spentByRecurring.get(t.recurring_expense_id) ?? 0) + t.amount
      );
    }
  }

  const recurringExpenses = recurringExpensesRaw.map((e) => ({
    ...e,
    amount: Number(e.amount),
    provision: monthlyProvision({ amount: Number(e.amount), period: e.period }),
    realSpent: spentByRecurring.get(e.id) ?? 0,
  }));

  const fixedProvisions = recurringExpenses.reduce((s, e) => s + e.provision, 0);
  const expectedIncome = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0);

  const extraordinaryIncome = transactions
    .filter((t) => t.type === "income" && !t.recurring_income_id)
    .reduce((s, t) => s + t.amount, 0);
  const realIncome = expectedIncome + extraordinaryIncome;

  const realExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const extraExpenses = transactions
    .filter((t) => t.type === "expense" && !t.recurring_expense_id)
    .reduce((s, t) => s + t.amount, 0);

  const provisions = fixedProvisions + savingsTarget;
  // Exceso de fijos: lo que ha crecido este mes el sobregasto acumulado del
  // año. Así el gas de invierno tira primero del colchón provisionado y solo
  // resta disponible cuando el fondo del concepto se agota.
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
 * Sobregasto acumulado del año hasta `month`: suma, por concepto de gasto
 * fijo, de max(0, gasto real YTD − provisionado YTD). Es cuánto han excedido
 * los fijos su colchón provisionado en lo que va de año.
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
 * Desviación acumulada del año por concepto (agrupa versiones de un fijo por
 * nombre): provisiones acumuladas de enero a `month` vs gasto real ligado.
 */
export async function getYearDeviations(
  supabase: SupabaseClient,
  month: string
): Promise<ConceptDeviation[]> {
  const year = month.slice(0, 4);
  const jan = `${year}-01-01`;
  const end = monthEnd(month);

  const [expensesQ, txQ] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("*")
      .lte("starts_on", end)
      .or(`ends_on.is.null,ends_on.gte.${jan}`),
    supabase
      .from("transactions")
      .select("amount, recurring_expense_id, date, type")
      .eq("type", "expense")
      .not("recurring_expense_id", "is", null)
      .gte("date", jan)
      .lte("date", end),
  ]);

  const rows = (expensesQ.data ?? []) as RecurringExpense[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const result = new Map<string, ConceptDeviation>();

  // Provisiones: por cada mes del año hasta `month`, suma la provisión de las
  // versiones activas ese mes, agrupada por nombre del concepto.
  for (let m = jan.slice(0, 8) + "01"; m <= month; m = addMonths(m, 1)) {
    for (const r of rows) {
      if (!activeInMonth(r, m)) continue;
      const entry = result.get(r.name) ?? {
        name: r.name,
        provisionYtd: 0,
        realYtd: 0,
        deviation: 0,
      };
      entry.provisionYtd += monthlyProvision({
        amount: Number(r.amount),
        period: r.period,
      });
      result.set(r.name, entry);
    }
  }

  for (const t of txQ.data ?? []) {
    const r = byId.get(t.recurring_expense_id!);
    if (!r) continue;
    const entry = result.get(r.name);
    if (!entry) continue;
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
 * Sugerencias de ajuste: gasto real de los últimos 12 meses anualizado vs
 * importe anual actual del fijo. Solo con ≥3 meses de histórico y >10% de
 * diferencia.
 */
export async function getSuggestions(
  supabase: SupabaseClient,
  month: string
): Promise<Suggestion[]> {
  const from = addMonths(month, -11);
  const end = monthEnd(month);

  const [expensesQ, txQ] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("*")
      .lte("starts_on", end)
      .or(`ends_on.is.null,ends_on.gte.${month}`),
    supabase
      .from("transactions")
      .select("amount, recurring_expense_id, date")
      .eq("type", "expense")
      .not("recurring_expense_id", "is", null)
      .gte("date", from)
      .lte("date", end),
  ]);

  const active = (expensesQ.data ?? []) as RecurringExpense[];
  // Todas las versiones (incluidas cerradas) para atribuir gasto por nombre
  const allQ = await supabase.from("recurring_expenses").select("id, name");
  const nameById = new Map((allQ.data ?? []).map((r) => [r.id, r.name]));

  const realByName = new Map<string, number>();
  const monthsByName = new Map<string, Set<string>>();
  for (const t of txQ.data ?? []) {
    const name = nameById.get(t.recurring_expense_id!);
    if (!name) continue;
    realByName.set(name, (realByName.get(name) ?? 0) + Number(t.amount));
    const set = monthsByName.get(name) ?? new Set<string>();
    set.add(t.date.slice(0, 7));
    monthsByName.set(name, set);
  }

  const suggestions: Suggestion[] = [];
  for (const e of active) {
    const real = realByName.get(e.name) ?? 0;
    // Meses transcurridos desde el inicio del concepto, capado a 12
    const oldestStart = e.starts_on.slice(0, 7) + "-01";
    const covered = Math.min(12, monthsBetween(oldestStart, month) + 1);
    if (covered < 3 || real === 0) continue;
    const estimatedAnnual = (real / covered) * 12;
    const currentAnnual =
      e.period === "annual" ? Number(e.amount) : Number(e.amount) * 12;
    if (Math.abs(estimatedAnnual - currentAnnual) / currentAnnual > 0.1) {
      suggestions.push({
        name: e.name,
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

  const [expensesQ, incomesQ, txQ, planQ] = await Promise.all([
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
      .select("date, amount, type, recurring_income_id")
      .gte("date", jan)
      .lte("date", dec31),
    supabase.from("savings_plans").select("*").maybeSingle(),
  ]);

  const recExpenses = (expensesQ.data ?? []) as RecurringExpense[];
  const recIncomes = (incomesQ.data ?? []) as RecurringIncome[];
  const savingsTarget = Number(planQ.data?.monthly_target ?? 0);

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
