import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getMonthBudget,
  getYearDeviations,
  getYearOverview,
} from "@/lib/budget";
import { monthStart, eur, type Category } from "@/lib/types";
import { YearChart } from "@/components/dashboard/year-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PiggyBank, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const month = monthStart(new Date());
  const year = Number(month.slice(0, 4));

  const [budget, overview, deviations, savingsQ, categoriesQ] =
    await Promise.all([
      getMonthBudget(supabase, month),
      getYearOverview(supabase, year),
      getYearDeviations(supabase, month),
      supabase.from("savings_movements").select("amount"),
      supabase.from("categories").select("*"),
    ]);

  const savingsBalance = (savingsQ.data ?? []).reduce(
    (s, m) => s + Number(m.amount),
    0
  );

  // Desglose del mes por categoría (solo gastos)
  const catById = new Map(
    (categoriesQ.data ?? []).map((c: Category) => [c.id, c.name])
  );
  const byCategory = new Map<string, number>();
  for (const t of budget.transactions) {
    if (t.type !== "expense") continue;
    const name = catById.get(t.category_id ?? "") ?? "Sin categoría";
    byCategory.set(name, (byCategory.get(name) ?? 0) + t.amount);
  }
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = categoryRows[0]?.[1] ?? 0;

  const monthLabel = new Date(month + "T00:00:00").toLocaleDateString("es-ES", {
    month: "long",
  });
  const worstDeviations = deviations
    .filter((d) => d.deviation < -20)
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">
        Hola 👋 <span className="capitalize">{monthLabel}</span> {year}
      </h1>

      {/* Disponible este mes */}
      <Card
        className={cn(
          budget.available >= 0
            ? "border-green-300 dark:border-green-800"
            : "border-red-300 dark:border-red-800"
        )}
      >
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Disponible este mes
          </p>
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
            {budget.carryover !== 0 &&
              ` ${budget.carryover > 0 ? "+" : "−"} arrastre ${eur(Math.abs(budget.carryover))}`}
          </p>
        </CardContent>
      </Card>

      {/* Hucha */}
      <Link href="/hucha">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <PiggyBank className="size-8 text-pink-500" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Hucha</p>
              <p className="text-xl font-bold">{eur(savingsBalance)}</p>
            </div>
            {budget.savingsTarget > 0 && (
              <p className="text-xs text-muted-foreground">
                objetivo {eur(budget.savingsTarget)}/mes
              </p>
            )}
          </CardContent>
        </Card>
      </Link>

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

      {/* Anual */}
      <Card>
        <CardHeader>
          <CardTitle>Año {year}: real vs previsto</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <YearChart overview={overview} currentMonth={month} />
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

      {/* Desglose por categoría del mes */}
      {categoryRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="capitalize">
              Gasto de {monthLabel} por categoría
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {categoryRows.map(([name, total]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-sm">{name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-red-400"
                    style={{ width: `${(total / maxCat) * 100}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-sm font-medium">
                  {eur(total)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
