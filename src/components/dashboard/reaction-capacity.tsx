import { eur } from "@/lib/types";
import type { CategoryBudgetRow } from "@/lib/budget";

/**
 * Capacidad de reacción: cuánto del gasto del mes está en categorías
 * recortables (Ocio, Ropa, Gastos Personales…). Es el margen de maniobra si
 * un mes hay que apretar el cinturón.
 */
export function ReactionCapacity({ rows }: { rows: CategoryBudgetRow[] }) {
  const flexible = rows
    .filter((r) => r.category.is_flexible && r.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const flexibleSpent = flexible.reduce((s, r) => s + r.spent, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  if (totalSpent <= 0) return null;
  const pct = Math.round((flexibleSpent / totalSpent) * 100);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Este mes, <span className="font-semibold">{eur(flexibleSpent)}</span> del
        gasto ({pct}%) está en categorías recortables: si hiciera falta frenar,
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
          <div key={r.category.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate text-muted-foreground">
              {r.category.name}
            </span>
            <span className="font-medium">{eur(r.spent)}</span>
            <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
              {Math.round((r.spent / totalSpent) * 100)}%
            </span>
          </div>
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
