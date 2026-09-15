"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MonthBudget } from "@/lib/budget";
import { addMonths } from "@/lib/budget";
import { eur } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Resumen del presupuesto con desglose desplegable: cómo se compone lo
 * previsto (categorías + ahorro vs ingresos recurrentes) y cómo va lo real
 * (el mismo cálculo del disponible que en Movimientos).
 */
export function BudgetSummary({ budget }: { budget: MonthBudget }) {
  const [open, setOpen] = useState(false);
  const margin = budget.expectedIncome - budget.budgeted;
  const categoriesBudget = budget.budgeted - budget.savingsTarget;
  const prevLabel = new Date(
    addMonths(budget.month, -1) + "T00:00:00"
  ).toLocaleDateString("es-ES", { month: "long" });

  const Row = ({
    label,
    amount,
    sign,
    muted,
    strong,
    color,
  }: {
    label: React.ReactNode;
    amount: number;
    sign?: "+" | "−";
    muted?: boolean;
    strong?: boolean;
    color?: string;
  }) => (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2",
        muted && "text-muted-foreground",
        strong && "border-t pt-1 font-semibold"
      )}
    >
      <span>{label}</span>
      <span className={cn("whitespace-nowrap tabular-nums", color)}>
        {sign && `${sign} `}
        {eur(amount)}
      </span>
    </div>
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <button className="w-full" onClick={() => setOpen((o) => !o)}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">
                Ingresos previstos
              </p>
              <p className="font-semibold text-green-600">
                {eur(budget.expectedIncome)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Presupuesto</p>
              <p className="font-semibold text-amber-600">
                {eur(budget.budgeted)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Margen previsto</p>
              <p className="font-semibold">{eur(margin)}</p>
            </div>
          </div>
          <p className="mt-1 flex items-center justify-center gap-0.5 text-xs text-muted-foreground">
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            ¿Qué significa esto?
          </p>
        </button>
        {/* En escritorio el desglose va siempre a la vista: hay sitio */}
        <div
          className={cn(
            "mx-auto mt-3 max-w-sm flex-col gap-3 border-t pt-3 text-sm @3xl:flex",
            open ? "flex" : "hidden"
          )}
        >
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                El plan del mes
              </p>
              <Row
                label="Ingresos recurrentes previstos"
                amount={budget.expectedIncome}
                sign="+"
              />
              <Row
                label="Presupuesto de las categorías"
                amount={categoriesBudget}
                sign="−"
              />
              {budget.savingsTarget > 0 && (
                <Row
                  label="Ahorro previsto"
                  amount={budget.savingsTarget}
                  sign="−"
                />
              )}
              <Row
                label="Margen si se cumple el plan"
                amount={margin}
                strong
                color={margin >= 0 ? "text-green-600" : "text-red-600"}
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Lo que va pasando de verdad
              </p>
              <Row
                label="Ingresos recurrentes (recibidos o previstos)"
                amount={budget.receivedIncome}
                sign="+"
              />
              {budget.extraordinaryIncome !== 0 && (
                <Row
                  label="Ingresos extraordinarios"
                  amount={budget.extraordinaryIncome}
                  sign="+"
                />
              )}
              <Row label="Gasto real" amount={budget.realExpenses} sign="−" />
              {budget.savingsTarget > 0 && (
                <Row
                  label="Ahorro previsto del mes"
                  amount={budget.savingsTarget}
                  sign="−"
                />
              )}
              {budget.prevClosed ? (
                <Row
                  label={`Arrastre de ${prevLabel} (sobrante al cerrarlo)`}
                  amount={Math.abs(budget.carryover)}
                  sign={budget.carryover >= 0 ? "+" : "−"}
                />
              ) : (
                <Row
                  label={
                    budget.prevHasActivity
                      ? `Arrastre: ${prevLabel} está sin cerrar, no arrastra nada`
                      : `Arrastre de ${prevLabel}`
                  }
                  amount={0}
                  sign="+"
                  muted
                />
              )}
              <Row
                label="Disponible hoy"
                amount={budget.available}
                strong
                color={
                  budget.available >= 0 ? "text-green-600" : "text-red-600"
                }
              />
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
