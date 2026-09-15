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
      {/* Escritorio: título · mes · acciones en una sola fila */}
      <div className="flex flex-col gap-4 @3xl:grid @3xl:grid-cols-[1fr_auto_1fr] @3xl:items-center">
        <div className="flex items-center justify-between @3xl:contents">
          <h1 className="text-xl font-semibold @3xl:order-1">Movimientos</h1>
          <div className="@3xl:order-3 @3xl:justify-self-end">
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
        <MonthNav month={month} className="@3xl:order-2" />
      </div>

      {/* Escritorio: lista a la izquierda, resumen fijo a la derecha */}
      <div className="flex flex-col gap-4 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_340px] @3xl:items-start @3xl:gap-6">
        <div className="@3xl:sticky @3xl:top-8 @3xl:order-2">
          <MonthSummary budget={budget} />
        </div>

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
    </div>
  );
}
