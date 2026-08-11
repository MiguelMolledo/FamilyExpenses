import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  addMonths,
  getCategoryBudgets,
  getMonthBudget,
  getYearOverview,
  monthEnd,
} from "@/lib/budget";
import { currentMonthStart, eur, type Category } from "@/lib/types";
import { MonthNav } from "@/components/movimientos/month-nav";
import { TransactionDialog } from "@/components/movimientos/transaction-dialog";
import { Button } from "@/components/ui/button";
import { YearChart } from "@/components/dashboard/year-chart";
import { ExpenseDistribution } from "@/components/dashboard/expense-distribution";
import { IncomeAllocation } from "@/components/dashboard/income-allocation";
import { ReactionCapacity } from "@/components/dashboard/reaction-capacity";
import { SavingsChart } from "@/components/dashboard/savings-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ArrowLeftRight,
  PiggyBank,
  Plus,
  TrendingUp,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const supabase = await createClient();
  const { mes } = await searchParams;
  const month = /^\d{4}-\d{2}-01$/.test(mes ?? "")
    ? mes!
    : currentMonthStart();
  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1; // 0-based

  const [
    budget,
    categoryBudgets,
    overview,
    savingsQ,
    categoriesQ,
    subcategoriesQ,
    petsQ,
    profilesQ,
  ] = await Promise.all([
    getMonthBudget(supabase, month),
    getCategoryBudgets(supabase, month),
    getYearOverview(supabase, year),
    supabase.from("savings_movements").select("date, amount").order("date"),
    supabase.from("categories").select("*").order("name"),
    supabase.from("subcategories").select("*").order("name"),
    supabase.from("pets").select("*").order("created_at"),
    supabase.from("profiles").select("*"),
  ]);

  // Hucha: saldo actual, saldo al empezar el año y acumulado por mes
  const movements = (savingsQ.data ?? []).map((m) => ({
    date: m.date as string,
    amount: Number(m.amount),
  }));
  const savingsBalance = movements.reduce((s, m) => s + m.amount, 0);
  const startBalance = movements
    .filter((m) => m.date < `${year}-01-01`)
    .reduce((s, m) => s + m.amount, 0);
  const savedThisYear = savingsBalance - startBalance;

  const realByMonth: (number | null)[] = [];
  const expectedByMonth: number[] = [];
  for (let i = 0; i < 12; i++) {
    const mStart = `${year}-${String(i + 1).padStart(2, "0")}-01`;
    const end = monthEnd(mStart);
    realByMonth.push(
      i <= monthIdx
        ? movements
            .filter((m) => m.date <= end)
            .reduce((s, m) => s + m.amount, 0)
        : null
    );
    expectedByMonth.push(startBalance + budget.savingsTarget * (i + 1));
  }
  const expectedSavedYtd = budget.savingsTarget * (monthIdx + 1);
  const savingsAhead = savedThisYear - expectedSavedYtd;

  // Desglose del mes por categoría (solo gastos, sin traspasos)
  const catById = new Map(
    (categoriesQ.data ?? []).map((c: Category) => [c.id, c.name])
  );
  const excludedCats = new Set(
    (categoriesQ.data ?? [])
      .filter((c: Category) => c.exclude_from_stats)
      .map((c: Category) => c.id)
  );
  const subNameById = new Map(
    (subcategoriesQ.data ?? []).map((s) => [s.id as string, s.name as string])
  );
  const byCategory = new Map<string, number>();
  // Desglose por subcategoría de cada categoría: alimenta el popup de los
  // gráficos (hover/toque sobre barras y leyendas)
  const subsByCategory = new Map<string, Map<string, number>>();
  for (const t of budget.transactions) {
    if (t.type !== "expense") continue;
    if (t.category_id && excludedCats.has(t.category_id)) continue;
    const name = catById.get(t.category_id ?? "") ?? "Sin categoría";
    byCategory.set(name, (byCategory.get(name) ?? 0) + t.amount);
    const subName =
      (t.subcategory_id && subNameById.get(t.subcategory_id)) ||
      "Sin subcategoría";
    const subMap = subsByCategory.get(name) ?? new Map<string, number>();
    subMap.set(subName, (subMap.get(subName) ?? 0) + t.amount);
    subsByCategory.set(name, subMap);
  }
  const categoryRows = [...byCategory.entries()].map(([name, amount]) => ({
    name,
    amount,
    subs: [...(subsByCategory.get(name) ?? new Map<string, number>())]
      .map(([n, a]) => ({ name: n, amount: a }))
      .sort((a, b) => b.amount - a.amount),
  }));
  const fixedSpent = budget.realExpenses - budget.extraExpenses;

  const monthLabel = new Date(month + "T00:00:00").toLocaleDateString("es-ES", {
    month: "long",
  });

  // Categorías en riesgo: pasadas de presupuesto o (sin acumulado anual) por
  // encima del 80% — el dato ya viene calculado en categoryBudgets
  const riskRows = categoryBudgets.rows
    .filter((r) => {
      if (r.budget == null || r.budget <= 0 || r.available == null)
        return false;
      if (r.available < 0) return true;
      return r.category.rollover !== "accumulate" && r.spent / r.budget >= 0.8;
    })
    .sort((a, b) => (a.available ?? 0) - (b.available ?? 0))
    .slice(0, 4);

  const annualMargin =
    overview.totals.expectedIncome - overview.totals.budgeted;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hola 👋</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/comparar"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftRight className="size-4" />
            Comparar
          </Link>
          <TransactionDialog
            month={month}
            categories={categoriesQ.data ?? []}
            subcategories={subcategoriesQ.data ?? []}
            recurringIncomes={budget.recurringIncomes}
            pets={petsQ.data ?? []}
            profiles={profilesQ.data ?? []}
          >
            <Button size="sm">
              <Plus className="size-4" />
              Añadir
            </Button>
          </TransactionDialog>
        </div>
      </div>

      <MonthNav month={month} base="/" />

      {!budget.prevClosed && budget.prevHasActivity && (
        <Link
          href={`/presupuesto?mes=${addMonths(month, -1)}`}
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            El mes anterior está sin cerrar y su sobrante no se arrastra. Toca
            para cerrarlo.
          </span>
        </Link>
      )}

      {/* Disponible este mes */}
      <Card
        className={cn(
          budget.available >= 0
            ? "border-green-300 dark:border-green-800"
            : "border-red-300 dark:border-red-800"
        )}
      >
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">Disponible este mes</p>
          <p
            className={cn(
              "text-4xl font-bold",
              budget.available >= 0 ? "text-green-600" : "text-red-600"
            )}
          >
            {eur(budget.available)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Ingresos {eur(budget.realIncome)} − gasto real{" "}
            {eur(budget.realExpenses)}
            {budget.savingsTarget > 0 &&
              ` − ahorro ${eur(budget.savingsTarget)}`}
            {budget.carryover !== 0 &&
              ` ${budget.carryover > 0 ? "+" : "−"} arrastre ${eur(Math.abs(budget.carryover))}`}
          </p>
        </CardContent>
      </Card>

      {/* Categorías al límite o pasadas: el detalle está en Presupuesto */}
      {riskRows.length > 0 && (
        <Link
          href="/presupuesto"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-sm"
        >
          <span className="flex items-center gap-1 text-muted-foreground">
            <TriangleAlert className="size-4 text-amber-500" />
            En riesgo:
          </span>
          {riskRows.map((r) => (
            <span
              key={r.category.id}
              className={cn(
                "font-medium",
                (r.available ?? 0) < 0 ? "text-red-600" : "text-amber-600"
              )}
            >
              {r.category.name}{" "}
              {(r.available ?? 0) < 0
                ? `−${eur(Math.abs(r.available ?? 0))}`
                : `${Math.round((r.spent / (r.budget ?? 1)) * 100)}%`}
            </span>
          ))}
        </Link>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/presupuesto">
          <Card className="h-full">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xs text-muted-foreground capitalize">
                Gastado {monthLabel}
              </p>
              <p className="text-lg font-bold text-red-600">
                {eur(budget.realExpenses)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                presupuesto {eur(budget.budgeted)}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/hucha">
          <Card className="h-full">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <PiggyBank className="size-3.5 text-pink-500" />
                Hucha
              </p>
              <p className="text-lg font-bold">{eur(savingsBalance)}</p>
              <p className="text-[10px] text-muted-foreground">
                {savedThisYear >= 0 ? "+" : "−"}
                {eur(Math.abs(savedThisYear))} este año
              </p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              {savingsAhead >= 0 ? (
                <TrendingUp className="size-3.5 text-green-600" />
              ) : (
                <TrendingDown className="size-3.5 text-red-600" />
              )}
              Vs objetivo
            </p>
            <p
              className={cn(
                "text-lg font-bold",
                savingsAhead >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {savingsAhead >= 0 ? "+" : "−"}
              {eur(Math.abs(savingsAhead))}
            </p>
            <p className="text-[10px] text-muted-foreground">
              objetivo {eur(expectedSavedYtd)} a estas alturas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sectores: a dónde van los ingresos del mes */}
      {budget.realIncome > 0 && categoryRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>¿A dónde van los ingresos?</CardTitle>
            <CardDescription>
              Porcentaje de los {eur(budget.realIncome)} ingresados este mes que
              va a cada categoría; lo que queda es margen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IncomeAllocation income={budget.realIncome} rows={categoryRows} />
          </CardContent>
        </Card>
      )}

      {/* Capacidad de reacción */}
      {categoryBudgets.totalSpent > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Capacidad de reacción</CardTitle>
          </CardHeader>
          <CardContent>
            <ReactionCapacity rows={categoryBudgets.rows} />
          </CardContent>
        </Card>
      )}

      {/* Distribución del gasto del mes */}
      {categoryRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="capitalize">
              Distribución de {monthLabel}
            </CardTitle>
            <CardDescription>
              {eur(budget.realExpenses)} gastados: {eur(fixedSpent)} en fijos ·{" "}
              {eur(budget.extraExpenses)} extra
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseDistribution rows={categoryRows} />
          </CardContent>
        </Card>
      )}

      {/* Ahorro del año */}
      <Card>
        <CardHeader>
          <CardTitle>Ahorro {year}</CardTitle>
          <CardDescription>
            {budget.savingsTarget > 0
              ? `Saldo de la hucha frente al objetivo de ${eur(budget.savingsTarget)}/mes`
              : "Saldo de la hucha (sin objetivo mensual configurado)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SavingsChart
            real={realByMonth}
            expected={expectedByMonth}
            currentIdx={monthIdx}
          />
        </CardContent>
      </Card>

      {/* Anual */}
      <Card>
        <CardHeader>
          <CardTitle>Año {year}: real vs previsto</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <YearChart overview={overview} currentMonth={month} />
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-muted p-2">
              <p className="text-xs text-muted-foreground">Ingresos previstos</p>
              <p className="font-semibold text-green-600">
                {eur(overview.totals.expectedIncome)}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <p className="text-xs text-muted-foreground">Presupuesto año</p>
              <p className="font-semibold text-amber-600">
                {eur(overview.totals.budgeted)}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <p className="text-xs text-muted-foreground">Margen previsto</p>
              <p
                className={cn(
                  "font-semibold",
                  annualMargin >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {eur(annualMargin)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-lg bg-muted p-2">
              <p className="text-xs text-muted-foreground">
                Ingresos acumulados
              </p>
              <p className="font-semibold text-green-600">
                {eur(
                  overview.months
                    .filter((m) => m.month <= month)
                    .reduce((s, m) => s + m.realIncome, 0)
                )}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <p className="text-xs text-muted-foreground">Gasto acumulado</p>
              <p className="font-semibold text-red-600">
                {eur(
                  overview.months
                    .filter((m) => m.month <= month)
                    .reduce((s, m) => s + m.realExpenses, 0)
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
