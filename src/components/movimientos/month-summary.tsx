"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MonthBudget } from "@/lib/budget";
import { addMonths } from "@/lib/budget";
import { eur } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Resumen del mes con el cálculo del disponible desplegable: de dónde sale
 * cada cifra (recurrentes, extraordinarios, fijos, ahorro, arrastre).
 */
export function MonthSummary({ budget }: { budget: MonthBudget }) {
  const [open, setOpen] = useState(false);
  const fixedSpent = budget.realExpenses - budget.extraExpenses;
  const prevLabel = new Date(
    addMonths(budget.month, -1) + "T00:00:00"
  ).toLocaleDateString("es-ES", { month: "long" });

  const Row = ({
    label,
    amount,
    sign,
    muted,
  }: {
    label: React.ReactNode;
    amount: number;
    sign?: "+" | "−";
    muted?: boolean;
  }) => (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2",
        muted ? "text-muted-foreground" : ""
      )}
    >
      <span>{label}</span>
      <span className="whitespace-nowrap tabular-nums">
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
              <p className="text-xs text-muted-foreground">Ingresos</p>
              <p className="font-semibold text-green-600">
                {eur(budget.realIncome)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gastado</p>
              <p className="font-semibold text-red-600">
                {eur(budget.realExpenses)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Disponible</p>
              <p
                className={cn(
                  "font-semibold",
                  budget.available >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {eur(budget.available)}
              </p>
            </div>
          </div>
          <p className="mt-1 flex items-center justify-center gap-0.5 text-xs text-muted-foreground">
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            ¿De dónde sale el disponible?
          </p>
        </button>
        {open && (
          <div className="mx-auto mt-3 flex max-w-sm flex-col gap-1 border-t pt-3 text-sm">
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
            {budget.realExpenses > 0 && (
              <p className="-mt-1 text-xs text-muted-foreground">
                {eur(fixedSpent)} en fijos · {eur(budget.extraExpenses)}{" "}
                variables
              </p>
            )}
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
            <div className="mt-1 flex items-baseline justify-between gap-2 border-t pt-1 font-semibold">
              <span>Disponible</span>
              <span
                className={cn(
                  "tabular-nums",
                  budget.available >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {eur(budget.available)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
