import { eur } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  CategoryBreakdown,
  type SubAmount,
} from "@/components/dashboard/category-breakdown";

const SLOTS = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
];

export type CategoryAmount = {
  name: string;
  amount: number;
  /** desglose por subcategoría, para el popup al pasar el ratón o tocar */
  subs?: SubAmount[];
};

/**
 * Parte-de-un-todo del gasto mensual: barra apilada (top 6 + "Otros")
 * con ranking etiquetado debajo. El color sigue a la categoría por orden
 * alfabético dentro del top, no a su tamaño. Cada segmento y cada fila
 * muestran el desglose por subcategoría en un popup (hover o toque).
 */
export function ExpenseDistribution({ rows }: { rows: CategoryAmount[] }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) return null;

  const ranked = [...rows].sort((a, b) => b.amount - a.amount);
  const top = ranked.slice(0, 6);
  const rest = ranked.slice(6);
  const restTotal = rest.reduce((s, r) => s + r.amount, 0);

  // Color estable: alfabético dentro del top del mes
  const colorByName = new Map(
    [...top]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((r, i) => [r.name, SLOTS[i]])
  );

  const segments = [
    ...top.map((r) => ({
      name: r.name,
      amount: r.amount,
      subs: r.subs ?? [],
      color: colorByName.get(r.name)!,
    })),
    ...(restTotal > 0
      ? [
          {
            name: `Otros (${rest.length})`,
            amount: restTotal,
            // El desglose de "Otros" son las propias categorías restantes
            subs: rest.map((r) => ({ name: r.name, amount: r.amount })),
            color: "var(--viz-other)",
          },
        ]
      : []),
  ];

  let cumulative = 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-4 w-full gap-[2px] rounded-full">
        {segments.map((s, i) => {
          const start = cumulative;
          cumulative += s.amount / total;
          return (
            <CategoryBreakdown
              key={s.name}
              title={s.name}
              total={s.amount}
              subs={s.subs}
              className="h-full min-w-[3px] cursor-pointer"
              // Cerca del borde derecho, el popup se ancla a la derecha
              popupClassName={start > 0.5 ? "left-auto right-0" : undefined}
              style={{ width: `${(s.amount / total) * 100}%` }}
            >
              <div
                title={`${s.name}: ${eur(s.amount)} (${Math.round((s.amount / total) * 100)}%)`}
                className={cn(
                  "h-full w-full",
                  i === 0 && "rounded-l-full",
                  i === segments.length - 1 && "rounded-r-full"
                )}
                style={{ background: s.color }}
              />
            </CategoryBreakdown>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        {segments.map((s) => (
          <CategoryBreakdown
            key={s.name}
            title={s.name}
            total={s.amount}
            subs={s.subs}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="font-medium">{eur(s.amount)}</span>
              <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                {Math.round((s.amount / total) * 100)}%
              </span>
            </div>
          </CategoryBreakdown>
        ))}
      </div>
    </div>
  );
}
