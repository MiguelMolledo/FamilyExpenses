import { createClient } from "@/lib/supabase/server";
import { getMonthBudget, monthEnd } from "@/lib/budget";
import { currentMonthStart } from "@/lib/types";
import { MonthNav } from "@/components/movimientos/month-nav";
import { MonthSummary } from "@/components/movimientos/month-summary";
import { TransactionsList } from "@/components/movimientos/transactions-list";
import { TransactionDialog } from "@/components/movimientos/transaction-dialog";
import { Button } from "@/components/ui/button";
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

      <MonthSummary budget={budget} />

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
