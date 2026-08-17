import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCategoryBudgets, getMonthBudget, addMonths } from "@/lib/budget";
import { BudgetSummary } from "@/components/presupuesto/budget-summary";
import { CategoryBudgets } from "@/components/presupuesto/category-budgets";
import { SurvivalMode } from "@/components/presupuesto/survival-mode";
import { currentMonthStart } from "@/lib/types";
import { RecurringIncomes } from "@/components/presupuesto/recurring-incomes";
import { CloseMonth } from "@/components/presupuesto/close-month";
import { MonthNav } from "@/components/movimientos/month-nav";

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const month = /^\d{4}-\d{2}-01$/.test(mes ?? "") ? mes! : currentMonthStart();

  const supabase = await createClient();
  const [budget, categoryBudgets, profilesQ, savingsQ] = await Promise.all([
    getMonthBudget(supabase, month),
    getCategoryBudgets(supabase, month),
    supabase.from("profiles").select("*"),
    supabase.from("savings_movements").select("amount"),
  ]);
  const savingsBalance = (savingsQ.data ?? []).reduce(
    (s, m) => s + Number(m.amount),
    0
  );

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

      <BudgetSummary budget={budget} />

      <CategoryBudgets rows={categoryBudgets.rows} />

      <SurvivalMode
        rows={categoryBudgets.rows}
        savingsBalance={savingsBalance}
      />

      <RecurringIncomes
        incomes={budget.recurringIncomes}
        profiles={profilesQ.data ?? []}
        month={month}
      />

      <CloseMonth budget={budget} />
    </div>
  );
}
