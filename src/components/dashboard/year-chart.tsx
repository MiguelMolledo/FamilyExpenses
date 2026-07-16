"use client";

import type { YearOverview } from "@/lib/budget";
import { eur } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTH_LABELS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Barras por mes: ingreso real (verde) vs gasto real (rojo), con una marca
 * de lo provisionado (línea). Solo divs, sin librería de gráficas.
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
      Math.max(m.realIncome, m.realExpenses, m.provisions)
    )
  );

  return (
    <div className="flex h-40 items-end gap-1">
      {overview.months.map((m, i) => {
        const isFuture = m.month > currentMonth;
        const isCurrent = m.month === currentMonth;
        return (
          <div
            key={m.month}
            className="group relative flex flex-1 flex-col items-center gap-0.5"
            title={`${m.month.slice(0, 7)}: ingresos ${eur(m.realIncome)}, gastos ${eur(m.realExpenses)}, previsto ${eur(m.provisions)}`}
          >
            <div className="relative flex h-32 w-full items-end justify-center gap-px">
              <div
                className={cn(
                  "w-1/2 rounded-t",
                  isFuture ? "bg-green-200 dark:bg-green-900" : "bg-green-500"
                )}
                style={{ height: `${(m.realIncome / max) * 100}%` }}
              />
              <div
                className={cn(
                  "w-1/2 rounded-t",
                  isFuture ? "bg-red-200 dark:bg-red-900" : "bg-red-500"
                )}
                style={{ height: `${(m.realExpenses / max) * 100}%` }}
              />
              {/* marca de provisiones */}
              <div
                className="absolute inset-x-0 border-t-2 border-dashed border-amber-500/70"
                style={{ bottom: `${(m.provisions / max) * 100}%` }}
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
  );
}
