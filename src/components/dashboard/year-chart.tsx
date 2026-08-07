"use client";

import type { YearOverview } from "@/lib/budget";
import { eur } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTH_LABELS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Barras por mes: ingreso real vs gasto real, con la marca de lo provisionado
 * (línea discontinua). Solo divs, sin librería de gráficas.
 */
export function YearChart({
  overview,
  currentMonth,
}: {
  overview: YearOverview;
  currentMonth: string;
}) {
  const max = Math.max(
    1,
    ...overview.months.map((m) =>
      Math.max(m.realIncome, m.realExpenses, m.budgeted)
    )
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ background: "var(--viz-income)" }}
          />
          Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ background: "var(--viz-expense)" }}
          />
          Gastos
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-0.5 w-4 border-t-2 border-dashed"
            style={{ borderColor: "var(--viz-planned)" }}
          />
          Previsto
        </span>
      </div>
      <div className="flex h-40 items-end gap-1.5">
        {overview.months.map((m, i) => {
          const isFuture = m.month > currentMonth;
          const isCurrent = m.month === currentMonth;
          return (
            <div
              key={m.month}
              className="group relative flex flex-1 flex-col items-center gap-0.5"
              title={`${m.month.slice(0, 7)}: ingresos ${eur(m.realIncome)}, gastos ${eur(m.realExpenses)}, previsto ${eur(m.budgeted)}`}
            >
              <div
                className={cn(
                  "relative flex h-32 w-full items-end justify-center gap-[2px] rounded-sm",
                  isCurrent && "bg-muted/60"
                )}
              >
                <div
                  className="w-[38%] rounded-t-[4px] transition-opacity group-hover:opacity-80"
                  style={{
                    height: `${Math.max(m.realIncome > 0 ? 2 : 0, (m.realIncome / max) * 100)}%`,
                    background: "var(--viz-income)",
                    opacity: isFuture ? 0.3 : 1,
                  }}
                />
                <div
                  className="w-[38%] rounded-t-[4px] transition-opacity group-hover:opacity-80"
                  style={{
                    height: `${Math.max(m.realExpenses > 0 ? 2 : 0, (m.realExpenses / max) * 100)}%`,
                    background: "var(--viz-expense)",
                    opacity: isFuture ? 0.3 : 1,
                  }}
                />
                {/* marca de provisiones */}
                <div
                  className="absolute inset-x-0 border-t-2 border-dashed opacity-70"
                  style={{
                    bottom: `${(m.budgeted / max) * 100}%`,
                    borderColor: "var(--viz-planned)",
                  }}
                />
              </div>
              <span
                className={cn(
                  "text-[10px]",
                  isCurrent
                    ? "font-bold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {MONTH_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
