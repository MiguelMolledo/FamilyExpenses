import { PiggyBank } from "lucide-react";
import { eur } from "@/lib/types";
import type { CategoryBudgetRow } from "@/lib/budget";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";

/**
 * Capacidad de reacción: cuánto se podría soltar este mes si hay que apretar
 * el cinturón — el gasto en lo marcado prescindible (categorías recortables
 * enteras o subcategorías con tijeras, a su %) más el ahorro previsto, que en
 * un apuro se pausa. Los porcentajes van sobre gasto + ahorro del mes.
 */
export function ReactionCapacity({
  rows,
  savingsTarget = 0,
}: {
  rows: CategoryBudgetRow[];
  savingsTarget?: number;
}) {
  const flexible = rows
    .filter((r) => r.flexibleSpent > 0)
    .sort((a, b) => b.flexibleSpent - a.flexibleSpent);
  const flexibleSpent = flexible.reduce((s, r) => s + r.flexibleSpent, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  if (totalSpent <= 0) return null;
  const total = totalSpent + savingsTarget;
  const margin = flexibleSpent + savingsTarget;
  const pct = Math.round((margin / total) * 100);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Si hiciera falta frenar, este mes podríais soltar{" "}
        <span className="font-semibold">{eur(margin)}</span> ({pct}% de lo que
        sale): el gasto en cosas prescindibles
        {savingsTarget > 0 && " y el ahorro, que se pausaría"}.
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--viz-1)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-col gap-1 pt-1">
        {savingsTarget > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex flex-1 items-center gap-1 truncate text-muted-foreground">
              <PiggyBank className="size-3.5 text-pink-500" />
              Ahorro previsto (se pausaría)
            </span>
            <span className="font-medium">{eur(savingsTarget)}</span>
            <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
              {Math.round((savingsTarget / total) * 100)}%
            </span>
          </div>
        )}
        {flexible.map((r) => (
          <CategoryBreakdown
            key={r.category.id}
            title={r.category.name}
            total={r.flexibleSpent}
            subs={r.subRows
              .filter(
                ({ sub, spent }) =>
                  spent > 0 &&
                  (r.category.is_flexible || Number(sub.prescindible_pct) > 0)
              )
              .map(({ sub, spent }) => {
                const subPct = Number(sub.prescindible_pct);
                const partial = !r.category.is_flexible && subPct < 100;
                return {
                  name: partial ? `${sub.name} (${subPct} %)` : sub.name,
                  amount: r.category.is_flexible
                    ? spent
                    : (spent * subPct) / 100,
                };
              })
              .sort((a, b) => b.amount - a.amount)}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-muted-foreground">
                {r.category.name}
              </span>
              <span className="font-medium">{eur(r.flexibleSpent)}</span>
              <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                {Math.round((r.flexibleSpent / total) * 100)}%
              </span>
            </div>
          </CategoryBreakdown>
        ))}
        {flexible.length === 0 && savingsTarget <= 0 && (
          <p className="text-sm text-muted-foreground">
            Sin gasto recortable este mes.
          </p>
        )}
      </div>
    </div>
  );
}
