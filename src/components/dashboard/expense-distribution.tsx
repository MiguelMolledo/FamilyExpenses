import { eur } from "@/lib/types";

const SLOTS = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
];

export type CategoryAmount = { name: string; amount: number };

/**
 * Parte-de-un-todo del gasto mensual: barra apilada (top 6 + "Otros")
 * con ranking etiquetado debajo. El color sigue a la categoría por orden
 * alfabético dentro del top, no a su tamaño.
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
    ...top.map((r) => ({ ...r, color: colorByName.get(r.name)! })),
    ...(restTotal > 0
      ? [
          {
            name: `Otros (${rest.length})`,
            amount: restTotal,
            color: "var(--viz-other)",
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.name}
            title={`${s.name}: ${eur(s.amount)} (${Math.round((s.amount / total) * 100)}%)`}
            className="h-full min-w-[3px]"
            style={{
              width: `${(s.amount / total) * 100}%`,
              background: s.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {segments.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-sm">
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
        ))}
      </div>
    </div>
  );
}
