"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Scissors } from "lucide-react";
import type { CategoryBudgetRow } from "@/lib/budget";
import { eur } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** "7,4 meses" / "1 mes"; a partir del año, "2,1 años" */
function fmtRunway(months: number): string {
  const fmt = (n: number) =>
    n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  if (months >= 12) {
    const y = months / 12;
    return `${fmt(y)} ${y < 1.05 ? "año" : "años"}`;
  }
  return `${fmt(months)} ${months < 1.05 ? "mes" : "meses"}`;
}

/**
 * Modo supervivencia: si mañana os quedáis sin ingresos, ¿cuál es el coste de
 * vida mínimo? Mínimo = presupuesto de categorías − lo marcado prescindible
 * (categorías is_flexible enteras o subcategorías con tijeras). Cruzado con la
 * hucha da el colchón: cuántos meses aguantaríais en mínimo sin ingresar nada.
 */
export function SurvivalMode({
  rows,
  savingsBalance,
}: {
  rows: CategoryBudgetRow[];
  savingsBalance: number;
}) {
  const [open, setOpen] = useState(false);

  const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  if (totalBudget <= 0) return null;
  const prescindible = rows.reduce((s, r) => s + r.prescindibleBudget, 0);
  const minimo = totalBudget - prescindible;
  const runway = minimo > 0 ? savingsBalance / minimo : null;

  const items = rows
    .flatMap((r) =>
      r.category.is_flexible
        ? r.budget
          ? [{ key: r.category.id, name: r.category.name, amount: r.budget }]
          : []
        : r.subRows
            .filter(
              ({ sub }) => sub.prescindible && sub.monthly_budget != null
            )
            .map(({ sub }) => ({
              key: sub.id,
              name: `${r.category.name} · ${sub.name}`,
              amount: Number(sub.monthly_budget),
            }))
    )
    .sort((a, b) => b.amount - a.amount);

  // Marcadas prescindibles pero sin importe en el desglose: no restan nada
  const unbudgeted = rows
    .filter((r) => !r.category.is_flexible)
    .flatMap((r) =>
      r.subRows.filter(
        ({ sub }) =>
          sub.prescindible &&
          sub.kind === "expense" &&
          sub.monthly_budget == null
      )
    ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="size-4 text-amber-600" />
          Modo supervivencia
        </CardTitle>
        <CardDescription>
          Si hubiera que apretar (paro, un bache), esto es lo que necesitáis de
          verdad para vivir; el resto se puede cortar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <button className="w-full" onClick={() => setOpen((o) => !o)}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Mínimo para vivir</p>
              <p className="font-semibold">{eur(minimo)}/mes</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Prescindible</p>
              <p className="font-semibold text-amber-600">
                {eur(prescindible)}/mes
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">La hucha da para</p>
              <p className="font-semibold text-green-600">
                {runway != null ? fmtRunway(runway) : "—"}
              </p>
            </div>
          </div>
          <p className="mt-1 flex items-center justify-center gap-0.5 text-xs text-muted-foreground">
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            ¿Cómo se calcula?
          </p>
        </button>
        {open && (
          <div className="mx-auto mt-3 flex max-w-sm flex-col gap-3 border-t pt-3 text-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span>Presupuesto de las categorías</span>
                <span className="whitespace-nowrap tabular-nums">
                  {eur(totalBudget)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-amber-600">
                <span>Prescindible (se podría cortar)</span>
                <span className="whitespace-nowrap tabular-nums">
                  − {eur(prescindible)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t pt-1 font-semibold">
                <span>Mínimo para vivir</span>
                <span className="whitespace-nowrap tabular-nums">
                  {eur(minimo)}/mes
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                El ahorro previsto no cuenta: en modo supervivencia se pausa.
              </p>
            </div>
            {runway != null && (
              <p>
                Con los <span className="font-medium">{eur(savingsBalance)}</span>{" "}
                de la hucha aguantaríais{" "}
                <span className="font-medium">{fmtRunway(runway)}</span> en modo
                mínimo sin ingresar nada.
              </p>
            )}
            {items.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Lo que se cortaría
                </p>
                {items.map((it) => (
                  <div
                    key={it.key}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-muted-foreground">
                      {it.name}
                    </span>
                    <span className="whitespace-nowrap tabular-nums">
                      {eur(it.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Aún no hay nada marcado: usa las tijeras{" "}
                <Scissors className="inline size-3" /> en el desglose de cada
                categoría para marcar lo que podríais cortar en un bache.
              </p>
            )}
            {unbudgeted > 0 && (
              <p className="text-xs text-amber-600">
                {unbudgeted === 1
                  ? "Hay 1 subcategoría prescindible sin importe en el desglose: no resta del mínimo hasta que le pongas presupuesto."
                  : `Hay ${unbudgeted} subcategorías prescindibles sin importe en el desglose: no restan del mínimo hasta que les pongas presupuesto.`}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
