import { createClient } from "@/lib/supabase/server";
import { getCategoryBudgets, getMonthBudget } from "@/lib/budget";
import { CategoryBudgets } from "@/components/presupuesto/category-budgets";
import { monthStart, eur } from "@/lib/types";
import { RecurringIncomes } from "@/components/presupuesto/recurring-incomes";
import { CloseMonth } from "@/components/presupuesto/close-month";
import { Card, CardContent } from "@/components/ui/card";

export default async function PresupuestoPage() {
  const supabase = await createClient();
  const month = monthStart(new Date());
  const [budget, categoryBudgets, profilesQ] = await Promise.all([
    getMonthBudget(supabase, month),
    getCategoryBudgets(supabase, month),
    supabase.from("profiles").select("*"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Presupuesto</h1>

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
