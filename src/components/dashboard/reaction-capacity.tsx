import { eur } from "@/lib/types";
import type { CategoryBudgetRow } from "@/lib/budget";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";

/**
 * Capacidad de reacción: cuánto del gasto del mes está en lo marcado como
 * prescindible (categorías recortables enteras o subcategorías con tijeras).
 * Es el margen de maniobra si un mes hay que apretar el cinturón.
 */
export function ReactionCapacity({ rows }: { rows: CategoryBudgetRow[] }) {
  const flexible = rows
    .filter((r) => r.flexibleSpent > 0)
    .sort((a, b) => b.flexibleSpent - a.flexibleSpent);
  const flexibleSpent = flexible.reduce((s, r) => s + r.flexibleSpent, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  if (totalSpent <= 0) return null;
  const pct = Math.round((flexibleSpent / totalSpent) * 100);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Este mes, <span className="font-semibold">{eur(flexibleSpent)}</span> del
        gasto ({pct}%) está en cosas prescindibles: si hiciera falta frenar,
        ese es vuestro margen de maniobra.
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--viz-1)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-col gap-1 pt-1">
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
                const pct = Number(sub.prescindible_pct);
                const partial = !r.category.is_flexible && pct < 100;
                return {
                  name: partial ? `${sub.name} (${pct} %)` : sub.name,
                  amount: r.category.is_flexible ? spent : (spent * pct) / 100,
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
                {Math.round((r.flexibleSpent / totalSpent) * 100)}%
              </span>
            </div>
          </CategoryBreakdown>
        ))}
        {flexible.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin gasto recortable este mes.
          </p>
        )}
      </div>
    </div>
  );
}
