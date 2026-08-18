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

const Row = ({
  label,
  amount,
  sign,
  strong,
  color,
}: {
  label: string;
  amount: number;
  sign?: "+" | "−";
  strong?: boolean;
  color?: string;
}) => (
  <div
    className={
      strong
        ? "flex items-baseline justify-between gap-2 border-t pt-1 font-semibold"
        : "flex items-baseline justify-between gap-2"
    }
  >
    <span>{label}</span>
    <span className={`whitespace-nowrap tabular-nums ${color ?? ""}`}>
      {sign && `${sign} `}
      {eur(amount)}
    </span>
  </div>
);

/**
 * Modo supervivencia: si mañana os quedáis sin ingresos, ¿cuál es el coste de
 * vida mínimo? Lo que sale cada mes = presupuesto de categorías + ahorro.
 * En un bache se corta lo marcado prescindible (categorías is_flexible
 * enteras o subcategorías con tijeras, con % parcial) y se pausa el ahorro,
 * prescindible por definición. Los sobres personales van como una categoría
 * prescindible más. Cruzado con la hucha da el colchón: cuántos meses
 * aguantaríais en mínimo sin ingresar nada.
 */
export function SurvivalMode({
  rows,
  savingsBalance,
  savingsTarget,
}: {
  rows: CategoryBudgetRow[];
  savingsBalance: number;
  savingsTarget: number;
}) {
  const [open, setOpen] = useState(false);

  const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  if (totalBudget <= 0) return null;
  const prescindible = rows.reduce((s, r) => s + r.prescindibleBudget, 0);
  /** todo lo que se cortaría o pausaría en un bache */
  const cut = prescindible + savingsTarget;
  /** lo que sale cada mes si se cumple el plan completo */
  const planTotal = totalBudget + savingsTarget;
  const minimo = totalBudget - prescindible;
  const runway = minimo > 0 ? savingsBalance / minimo : null;

  const items = [
    ...(savingsTarget > 0
      ? [{ key: "ahorro", name: "Ahorro previsto (se pausa)", amount: savingsTarget }]
      : []),
    ...rows.flatMap((r) =>
      r.category.is_flexible
        ? r.budget
          ? [{ key: r.category.id, name: r.category.name, amount: r.budget }]
          : []
        : r.subRows
            .filter(
              ({ sub }) =>
                Number(sub.prescindible_pct) > 0 && sub.monthly_budget != null
            )
            .map(({ sub }) => {
              const pct = Number(sub.prescindible_pct);
              return {
                key: sub.id,
                name:
                  `${r.category.name} · ${sub.name}` +
                  (pct < 100 ? ` (${pct} %)` : ""),
                amount: (Number(sub.monthly_budget) * pct) / 100,
              };
            })
    ),
  ].sort((a, b) => b.amount - a.amount);

  // Marcadas prescindibles pero sin importe en el desglose: no restan nada
  const unbudgeted = rows
    .filter((r) => !r.category.is_flexible)
    .flatMap((r) =>
      r.subRows.filter(
        ({ sub }) =>
          Number(sub.prescindible_pct) > 0 &&
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
          verdad para vivir; el resto se corta o se pausa.
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
              <p className="font-semibold text-amber-600">{eur(cut)}/mes</p>
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
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Lo que sale en un mes normal
              </p>
              <Row label="Presupuesto de las categorías" amount={totalBudget} />
              {savingsTarget > 0 && (
                <Row label="Ahorro previsto" amount={savingsTarget} />
              )}
              <Row label="Total del plan" amount={planTotal} strong />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                En modo supervivencia
              </p>
              <Row
                label="Prescindible de las categorías"
                amount={prescindible}
                sign="−"
                color="text-amber-600"
              />
              {savingsTarget > 0 && (
                <Row
                  label="El ahorro se pausa"
                  amount={savingsTarget}
                  sign="−"
                  color="text-amber-600"
                />
              )}
              <Row label="Mínimo para vivir" amount={minimo} strong />
            </div>
            {runway != null && (
              <p>
                Con los{" "}
                <span className="font-medium">{eur(savingsBalance)}</span> de la
                hucha aguantaríais{" "}
                <span className="font-medium">{fmtRunway(runway)}</span> en modo
                mínimo sin ingresar nada.
              </p>
            )}
            {items.length > 0 && (
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
            )}
            {prescindible === 0 && (
              <p className="text-xs text-muted-foreground">
                Aún no hay nada marcado en las categorías: usa las tijeras{" "}
                <Scissors className="inline size-3" /> en el desglose de cada
                una para marcar lo que podríais cortar en un bache.
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
