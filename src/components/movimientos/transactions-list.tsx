"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, PawPrint, Repeat, Sparkles } from "lucide-react";
import { FilterBar, fold } from "@/components/filter-bar";
import { createClient } from "@/lib/supabase/client";
import {
  eur,
  type Category,
  type Pet,
  type Profile,
  type RecurringIncome,
  type Subcategory,
  type Transaction,
} from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "./transaction-dialog";
import { cn } from "@/lib/utils";

export function TransactionsList({
  transactions,
  categories,
  subcategories,
  recurringIncomes,
  pets,
  profiles,
  month,
  splitIds,
}: {
  transactions: Transaction[];
  categories: Category[];
  subcategories: Subcategory[];
  recurringIncomes: RecurringIncome[];
  pets: Pet[];
  profiles: Profile[];
  month: string;
  splitIds: string[];
}) {
  const router = useRouter();
  const catById = new Map(categories.map((c) => [c.id, c.name]));
  const subById = new Map(subcategories.map((s) => [s.id, s.name]));
  const splitSet = new Set(splitIds);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  // Filtro por texto/categoría y agrupación alfabética por categoría
  // ("Sin categoría" al final; dentro de cada grupo, por fecha descendente)
  const groups = useMemo(() => {
    const catById = new Map(categories.map((c) => [c.id, c.name]));
    const q = fold(query.trim());
    const visible = transactions.filter((t) => {
      if (catFilter === "none" && t.category_id) return false;
      if (catFilter && catFilter !== "none" && t.category_id !== catFilter)
        return false;
      if (!q) return true;
      const catName = catById.get(t.category_id ?? "") ?? "";
      return fold(`${t.description ?? ""} ${catName}`).includes(q);
    });
    const byCat = new Map<string, Transaction[]>();
    for (const t of visible) {
      const name = catById.get(t.category_id ?? "") ?? "Sin categoría";
      byCat.set(name, [...(byCat.get(name) ?? []), t]);
    }
    return [...byCat.entries()]
      .sort(([a], [b]) =>
        a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b, "es")
      )
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => b.date.localeCompare(a.date)),
        net: items.reduce(
          (s, t) => s + (t.type === "income" ? t.amount : -t.amount),
          0
        ),
      }));
  }, [transactions, query, catFilter, categories]);

  async function remove(id: string) {
    if (removing) return;
    setRemoving(id);
    const supabase = createClient();
    let { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      // Primer intento tras un rato inactivo: el token puede haber caducado.
      // Se refresca la sesión y se reintenta una vez antes de avisar.
      await supabase.auth.refreshSession();
      ({ error } = await supabase.from("transactions").delete().eq("id", id));
    }
    setRemoving(null);
    if (error) return void toast.error("No se pudo eliminar: " + error.message);
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
    <div className="flex flex-col gap-3">
      <FilterBar
        query={query}
        onQuery={setQuery}
        categoryId={catFilter}
        onCategory={setCatFilter}
        categories={categories}
      />
      {groups.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nada coincide con el filtro.
          </CardContent>
        </Card>
      )}
      {groups.map((g) => (
        <Card key={g.name}>
          <CardContent className="flex flex-col divide-y pt-2">
            <div className="flex items-center justify-between py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.name}
              </p>
              <span
                className={cn(
                  "text-xs font-medium",
                  g.net >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {g.net >= 0 ? "+" : "−"}
                {eur(Math.abs(g.net))}
              </span>
            </div>
            {g.items.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-2.5">
            <TransactionDialog
              month={month}
              categories={categories}
              subcategories={subcategories}
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
                  {(t.is_fixed || t.recurring_income_id) && (
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
                  {t.subcategory_id && subById.get(t.subcategory_id)
                    ? ` › ${subById.get(t.subcategory_id)}`
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
            <Button
              variant="ghost"
              size="icon"
              disabled={removing !== null}
              onClick={() => remove(t.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
