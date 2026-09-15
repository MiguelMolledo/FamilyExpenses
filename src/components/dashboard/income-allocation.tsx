import { eur } from "@/lib/types";
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

export type IncomeSlice = {
  name: string;
  amount: number;
  /** desglose por subcategoría, para el popup al pasar el ratón o tocar */
  subs?: SubAmount[];
};

/**
 * Sectores (donut SVG): qué % de los ingresos del mes va a cada categoría de
 * gasto (top 6 + "Otros"). Lo no gastado aparece como "Margen". El color
 * sigue a la categoría por orden alfabético dentro del top, como en el resto
 * de gráficos.
 */
export function IncomeAllocation({
  income,
  rows,
}: {
  income: number;
  rows: IncomeSlice[];
}) {
  if (income <= 0) return null;

  const ranked = [...rows].filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = ranked.slice(0, 6);
  const rest = ranked.slice(6);
  const restTotal = rest.reduce((s, r) => s + r.amount, 0);
  const spent = ranked.reduce((s, r) => s + r.amount, 0);
  const margin = income - spent;

  const colorByName = new Map(
    [...top]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((r, i) => [r.name, SLOTS[i]])
  );

  const slices = [
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
            subs: rest.map((r) => ({ name: r.name, amount: r.amount })),
            color: "var(--viz-other)",
          },
        ]
      : []),
    ...(margin > 0
      ? [
          {
            name: "Margen (sin gastar)",
            amount: margin,
            subs: [] as SubAmount[],
            color: "var(--muted)",
          },
        ]
      : []),
  ];
  // Si se gasta más que los ingresos, el donut se dibuja sobre el gasto total
  const denom = Math.max(income, spent);

  // Donut: arcos con stroke-dasharray sobre una circunferencia unitaria
  const R = 15.915; // circunferencia 100
  let offset = 25; // empieza arriba
  const arcs = slices.map((s) => {
    const len = (s.amount / denom) * 100;
    const arc = { ...s, len, offset };
    offset -= len;
    return arc;
  });

  return (
    <div className="flex items-center gap-4 @3xl:gap-6">
      <svg viewBox="0 0 42 42" className="size-36 shrink-0 @3xl:size-44" role="img"
        aria-label="Distribución de los ingresos del mes por categoría">
        {arcs.map((a) => (
          <circle
            key={a.name}
            cx="21"
            cy="21"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth="6"
            strokeDasharray={`${Math.max(a.len - 0.4, 0.1)} ${100 - Math.max(a.len - 0.4, 0.1)}`}
            strokeDashoffset={a.offset}
          />
        ))}
        <text
          x="21"
          y="20"
          textAnchor="middle"
          className="fill-foreground text-[5px] font-semibold"
        >
          {Math.round((spent / income) * 100)}%
        </text>
        <text
          x="21"
          y="26"
          textAnchor="middle"
          className="fill-muted-foreground text-[3px]"
        >
          gastado
        </text>
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {slices.map((s) => (
          <CategoryBreakdown
            key={s.name}
            title={s.name}
            total={s.amount}
            subs={s.subs}
            className="cursor-pointer"
            popupClassName="left-auto right-0"
          >
            <div className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="font-medium">{eur(s.amount)}</span>
              <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                {Math.round((s.amount / income) * 100)}%
              </span>
            </div>
          </CategoryBreakdown>
        ))}
      </div>
    </div>
  );
}
