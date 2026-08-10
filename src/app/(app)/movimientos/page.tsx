import { createClient } from "@/lib/supabase/server";
import { getMonthBudget, monthEnd } from "@/lib/budget";
import { currentMonthStart, eur } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MonthNav } from "@/components/movimientos/month-nav";
import { TransactionsList } from "@/components/movimientos/transactions-list";
import { TransactionDialog } from "@/components/movimientos/transaction-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const month = /^\d{4}-\d{2}-01$/.test(mes ?? "")
    ? mes!
    : currentMonthStart();

  const supabase = await createClient();
  const [budget, categoriesQ, subcategoriesQ, petsQ, profilesQ, splitsQ] =
    await Promise.all([
      getMonthBudget(supabase, month),
      supabase.from("categories").select("*").order("name"),
      supabase.from("subcategories").select("*").order("name"),
      supabase.from("pets").select("*").order("created_at"),
      supabase.from("profiles").select("*"),
      supabase
        .from("transaction_pet_splits")
        .select("*, transactions!inner(date)")
        .gte("transactions.date", month)
        .lte("transactions.date", monthEnd(month)),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Movimientos</h1>
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

      <MonthNav month={month} />

      <Card>
        <CardContent className="grid grid-cols-3 gap-2 pt-6 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Ingresos</p>
            <p className="font-semibold text-green-600">
              {eur(budget.realIncome)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Gastado</p>
            <p className="font-semibold text-red-600">
              {eur(budget.realExpenses)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Disponible</p>
            <p
              className={cn(
                "font-semibold",
                budget.available >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {eur(budget.available)}
            </p>
          </div>
        </CardContent>
      </Card>

      <TransactionsList
        transactions={budget.transactions}
        categories={categoriesQ.data ?? []}
        subcategories={subcategoriesQ.data ?? []}
        recurringIncomes={budget.recurringIncomes}
        pets={petsQ.data ?? []}
        profiles={profilesQ.data ?? []}
        month={month}
        splitIds={[
          ...new Set((splitsQ.data ?? []).map((s) => s.transaction_id as string)),
        ]}
      />
    </div>
  );
}
