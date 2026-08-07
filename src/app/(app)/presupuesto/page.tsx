import { createClient } from "@/lib/supabase/server";
import {
  getMonthBudget,
  getSuggestions,
  getYearDeviations,
} from "@/lib/budget";
import { monthStart, eur } from "@/lib/types";
import { RecurringExpenses } from "@/components/presupuesto/recurring-expenses";
import { RecurringIncomes } from "@/components/presupuesto/recurring-incomes";
import { Suggestions } from "@/components/presupuesto/suggestions";
import { Deviations } from "@/components/presupuesto/deviations";
import { CloseMonth } from "@/components/presupuesto/close-month";
import { Card, CardContent } from "@/components/ui/card";

export default async function PresupuestoPage() {
  const supabase = await createClient();
  const month = monthStart(new Date());
  const [
    budget,
    suggestions,
    deviations,
    categoriesQ,
    subcategoriesQ,
    profilesQ,
    upcomingQ,
  ] =
    await Promise.all([
      getMonthBudget(supabase, month),
      getSuggestions(supabase, month),
      getYearDeviations(supabase, month),
      supabase.from("categories").select("*").order("name"),
      supabase.from("subcategories").select("*").order("name"),
      supabase.from("profiles").select("*"),
      supabase
        .from("recurring_expenses")
        .select("id, name, amount, period, starts_on, supersedes_id")
        .gt("starts_on", month)
        .not("supersedes_id", "is", null),
    ]);

  // Versión futura pendiente de cada fijo, indexada por el fijo al que sustituye
  const upcoming = Object.fromEntries(
    (upcomingQ.data ?? []).map((u) => [
      u.supersedes_id as string,
      { ...u, amount: Number(u.amount) },
    ])
  );

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
            <p className="text-xs text-muted-foreground">Provisiones</p>
            <p className="font-semibold text-amber-600">
              {eur(budget.provisions)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Margen previsto</p>
            <p className="font-semibold">
              {eur(budget.expectedIncome - budget.provisions)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Suggestions suggestions={suggestions} />

      <RecurringExpenses
        expenses={budget.recurringExpenses}
        categories={categoriesQ.data ?? []}
        subcategories={subcategoriesQ.data ?? []}
        upcoming={upcoming}
        month={month}
      />

      <RecurringIncomes
        incomes={budget.recurringIncomes}
        profiles={profilesQ.data ?? []}
        month={month}
      />

      <Deviations deviations={deviations} />

      <CloseMonth budget={budget} />
    </div>
  );
}
