import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getCategoryBudgets,
  getMonthBudget,
  getYearDeviations,
  getYearOverview,
  monthEnd,
} from "@/lib/budget";
import { monthStart, eur, type Category } from "@/lib/types";
import { MonthNav } from "@/components/movimientos/month-nav";
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
import { PiggyBank, TriangleAlert, TrendingUp, TrendingDown } from "lucide-react";
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
    : monthStart(new Date());
  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1; // 0-based

  const [budget, categoryBudgets, overview, deviations, savingsQ, categoriesQ] =
    await Promise.all([
      getMonthBudget(supabase, month),
      getCategoryBudgets(supabase, month),
      getYearOverview(supabase, year),
      getYearDeviations(supabase, month),
      supabase.from("savings_movements").select("date, amount").order("date"),
      supabase.from("categories").select("*"),
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
  const byCategory = new Map<string, number>();
  for (const t of budget.transactions) {
    if (t.type !== "expense") continue;
    if (t.category_id && excludedCats.has(t.category_id)) continue;
    const name = catById.get(t.category_id ?? "") ?? "Sin categoría";
    byCategory.set(name, (byCategory.get(name) ?? 0) + t.amount);
  }
  const categoryRows = [...byCategory.entries()].map(([name, amount]) => ({
    name,
    amount,
  }));
  const fixedSpent = budget.realExpenses - budget.extraExpenses;

  const monthLabel = new Date(month + "T00:00:00").toLocaleDateString("es-ES", {
    month: "long",
  });
  const worstDeviations = deviations
    .filter((d) => d.deviation < -20)
    .slice(0, 3);

  const annualMargin =
    overview.totals.expectedIncome - overview.totals.provisions;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Hola 👋</h1>

      <MonthNav month={month} base="/" />

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
            Ingresos {eur(budget.realIncome)} − provisiones{" "}
            {eur(budget.provisions)} − extras {eur(budget.extraExpenses)}
            {budget.fixedOverrun > 0.005 &&
              ` − exceso de fijos ${eur(budget.fixedOverrun)}`}
            {budget.fixedOverrun < -0.005 &&
              ` + exceso recuperado ${eur(-budget.fixedOverrun)}`}
            {budget.carryover !== 0 &&
              ` ${budget.carryover > 0 ? "+" : "−"} arrastre ${eur(Math.abs(budget.carryover))}`}
          </p>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground capitalize">
              Gastado {monthLabel}
            </p>
            <p className="text-lg font-bold text-red-600">
              {eur(budget.realExpenses)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              previsto {eur(budget.provisions)}
            </p>
          </CardContent>
        </Card>
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

      {/* Avisos de desviación */}
      {worstDeviations.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardContent className="flex flex-col gap-1 pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <TriangleAlert className="size-4 text-amber-600" />
              Conceptos gastando más de lo provisionado
            </p>
            {worstDeviations.map((d) => (
              <p key={d.name} className="text-sm">
                <strong>{d.name}</strong>: {eur(d.deviation)} este año
              </p>
            ))}
          </CardContent>
        </Card>
      )}

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
              <p className="text-xs text-muted-foreground">Provisiones año</p>
              <p className="font-semibold text-amber-600">
                {eur(overview.totals.provisions)}
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
