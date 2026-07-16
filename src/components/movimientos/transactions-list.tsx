"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, PawPrint, Repeat, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  eur,
  type Category,
  type Pet,
  type Profile,
  type RecurringExpense,
  type RecurringIncome,
  type Transaction,
} from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "./transaction-dialog";
import { cn } from "@/lib/utils";

export function TransactionsList({
  transactions,
  categories,
  recurringExpenses,
  recurringIncomes,
  pets,
  profiles,
  month,
  splitIds,
}: {
  transactions: Transaction[];
  categories: Category[];
  recurringExpenses: RecurringExpense[];
  recurringIncomes: RecurringIncome[];
  pets: Pet[];
  profiles: Profile[];
  month: string;
  splitIds: string[];
}) {
  const router = useRouter();
  const catById = new Map(categories.map((c) => [c.id, c.name]));
  const splitSet = new Set(splitIds);

  async function remove(id: string) {
    const { error } = await createClient()
      .from("transactions")
      .delete()
      .eq("id", id);
    if (error) return void toast.error("No se pudo eliminar");
    toast.success("Movimiento eliminado");
    router.refresh();
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No hay movimientos este mes.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col divide-y pt-2">
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-2.5">
            <TransactionDialog
              month={month}
              categories={categories}
              recurringExpenses={recurringExpenses}
              recurringIncomes={recurringIncomes}
              pets={pets}
              profiles={profiles}
              transaction={t}
            >
              <button className="flex-1 min-w-0 text-left">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  {t.description ||
                    catById.get(t.category_id ?? "") ||
                    (t.type === "expense" ? "Gasto" : "Ingreso")}
                  {splitSet.has(t.id) && (
                    <PawPrint className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {(t.recurring_expense_id || t.recurring_income_id) && (
                    <Repeat className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {t.is_extraordinary && (
                    <Sparkles className="size-3.5 shrink-0 text-amber-500" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(t.date + "T00:00:00").toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                  })}
                  {t.category_id && catById.get(t.category_id)
                    ? ` · ${catById.get(t.category_id)}`
                    : ""}
                </p>
              </button>
            </TransactionDialog>
            <span
              className={cn(
                "font-semibold",
                t.type === "income" ? "text-green-600" : "text-red-600"
              )}
            >
              {t.type === "income" ? "+" : "−"}
              {eur(t.amount)}
            </span>
            <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
