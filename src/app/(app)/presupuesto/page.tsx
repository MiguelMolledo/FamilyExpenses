import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCategoryBudgets, getMonthBudget, addMonths } from "@/lib/budget";
import { CategoryBudgets } from "@/components/presupuesto/category-budgets";
import { currentMonthStart, eur } from "@/lib/types";
import { RecurringIncomes } from "@/components/presupuesto/recurring-incomes";
import { CloseMonth } from "@/components/presupuesto/close-month";
import { MonthNav } from "@/components/movimientos/month-nav";
import { Card, CardContent } from "@/components/ui/card";

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const month = /^\d{4}-\d{2}-01$/.test(mes ?? "") ? mes! : currentMonthStart();

  const supabase = await createClient();
  const [budget, categoryBudgets, profilesQ] = await Promise.all([
    getMonthBudget(supabase, month),
    getCategoryBudgets(supabase, month),
    supabase.from("profiles").select("*"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Presupuesto</h1>

      <MonthNav month={month} base="/presupuesto" />

      {!budget.prevClosed && budget.prevHasActivity && (
        <Link
          href={`/presupuesto?mes=${addMonths(month, -1)}`}
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            El mes anterior está sin cerrar: este mes arranca sin arrastre.
            Toca para ir a cerrarlo.
          </span>
        </Link>
      )}

      <Card>
        <CardContent className="grid grid-cols-3 gap-2 pt-6 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Ingresos previstos</p>
            <p className="font-semibold text-green-600">
              {eur(budget.expectedIncome)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Presupuesto</p>
            <p className="font-semibold text-amber-600">
              {eur(budget.budgeted)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Margen previsto</p>
            <p className="font-semibold">
              {eur(budget.expectedIncome - budget.budgeted)}
            </p>
          </div>
        </CardContent>
      </Card>

      <CategoryBudgets rows={categoryBudgets.rows} />

      <RecurringIncomes
        incomes={budget.recurringIncomes}
        profiles={profilesQ.data ?? []}
        month={month}
      />

      <CloseMonth budget={budget} />
    </div>
  );
}
