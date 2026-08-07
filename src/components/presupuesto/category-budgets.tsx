"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { eur } from "@/lib/types";
import type { CategoryBudgetRow } from "@/lib/budget";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ROLLOVER_LABELS = {
  accumulate: "Sobrante: acumula",
  to_savings: "Sobrante: a ahorro",
} as const;

/**
 * Presupuesto mensual por categoría. Todo gasto de la categoría (fijo o
 * variable) descuenta de aquí. Con «acumula», el disponible arrastra lo no
 * gastado de meses anteriores del año; con «a ahorro», cada mes parte de cero.
 */
export function CategoryBudgets({ rows }: { rows: CategoryBudgetRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Unidad de entrada por campo: se guarda siempre en €/mes, pero puedes
  // teclear el importe anual (p.ej. gasoil 2500€/año) y se divide entre 12.
  const [units, setUnits] = useState<Record<string, "month" | "year">>({});

  const toMonthly = (id: string, raw: string): string => {
    if (raw.trim() === "" || units[id] !== "year") return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? (n / 12).toFixed(2) : raw;
  };

  const UnitToggle = ({ id }: { id: string }) => (
    <button
      type="button"
      className="shrink-0 rounded-md border px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
      title="Cambia si el importe que escribes es mensual o anual (se guarda al mes)"
      onClick={() =>
        setUnits((p) => ({
          ...p,
          [id]: (p[id] ?? "month") === "month" ? "year" : "month",
        }))
      }
    >
      {(units[id] ?? "month") === "month" ? "€/mes" : "€/año ÷12"}
    </button>
  );

  async function saveBudget(categoryId: string, raw: string) {
    const value = raw.trim() === "" ? null : Number(raw);
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    const { error } = await createClient()
      .from("categories")
      .update({ monthly_budget: value })
      .eq("id", categoryId);
    if (error) return void toast.error("No se pudo guardar el presupuesto");
    router.refresh();
  }

  async function saveRollover(categoryId: string, rollover: string) {
    const { error } = await createClient()
      .from("categories")
      .update({ rollover })
      .eq("id", categoryId);
    if (error) return void toast.error("No se pudo guardar");
    router.refresh();
  }

  async function saveSubBudget(subId: string, raw: string) {
    const value = raw.trim() === "" ? null : Number(raw);
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    const { error } = await createClient()
      .from("subcategories")
      .update({ monthly_budget: value })
      .eq("id", subId);
    if (error) return void toast.error("No se pudo guardar el desglose");
    router.refresh();
  }

  const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Presupuesto por categorías</CardTitle>
        <CardDescription>
          {eur(totalSpent)} gastados de {eur(totalBudget)} presupuestados este
          mes. El presupuesto se pone en la categoría; el desglose por
          subcategoría es opcional.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {rows.map((r) => {
          const over = r.available != null && r.available < 0;
          const pct =
            r.budget && r.budget > 0
              ? Math.min(100, (r.spent / r.budget) * 100)
              : 0;
          return (
            <div key={r.category.id} className="flex flex-col gap-1.5 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  className="flex flex-1 items-center gap-1 text-left font-medium"
                  onClick={() =>
                    setExpanded((p) => ({
                      ...p,
                      [r.category.id]: !p[r.category.id],
                    }))
                  }
                >
                  {expanded[r.category.id] ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  {r.category.name}
                </button>
                <UnitToggle id={r.category.id} />
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder={
                    (units[r.category.id] ?? "month") === "month"
                      ? "€/mes"
                      : "€/año"
                  }
                  className="h-8 w-24 text-right text-sm"
                  defaultValue={r.budget ?? ""}
                  key={`${r.category.id}-${r.budget ?? ""}`}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [r.category.id]: e.target.value }))
                  }
                  onBlur={() => {
                    const d = drafts[r.category.id];
                    if (d !== undefined && d !== String(r.budget ?? ""))
                      saveBudget(r.category.id, toMonthly(r.category.id, d));
                  }}
                />
              </div>
              {r.budget != null && (
                <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        over
                          ? "bg-red-500"
                          : pct > 80
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {eur(r.spent)} de {eur(r.budget)}
                      {r.fixedSpent > 0 && ` (${eur(r.fixedSpent)} en fijos)`}
                    </span>
                    <span className={cn(over && "font-medium text-red-600")}>
                      {r.available != null &&
                        (over
                          ? `${eur(-r.available)} pasados`
                          : `${eur(r.available)} disponibles`)}
                      {r.accumulated != null &&
                        Math.abs(r.accumulated) >= 0.01 &&
                        ` (${r.accumulated > 0 ? "+" : ""}${eur(
                          r.accumulated
                        )} del año)`}
                    </span>
                  </div>
                </>
              )}
              {expanded[r.category.id] && (
                <div className="flex flex-col gap-1 pl-5 pt-1">
                  <Select
                    value={r.category.rollover}
                    items={ROLLOVER_LABELS}
                    onValueChange={(v) => v && saveRollover(r.category.id, v)}
                  >
                    <SelectTrigger className="h-7 w-fit text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accumulate">
                        Sobrante: acumula para otros meses
                      </SelectItem>
                      <SelectItem value="to_savings">
                        Sobrante: a ahorro al cerrar el mes
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {r.subRows.map(({ sub, spent }) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="flex-1 text-muted-foreground">
                        {sub.name}
                        {sub.kind === "income" && " (ingreso)"}
                      </span>
                      <span className="text-muted-foreground">{eur(spent)}</span>
                      {sub.kind === "expense" && (
                        <>
                          <UnitToggle id={sub.id} />
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            placeholder="—"
                            className="h-7 w-20 text-right text-xs"
                            defaultValue={sub.monthly_budget ?? ""}
                            key={`${sub.id}-${sub.monthly_budget ?? ""}`}
                            onChange={(e) =>
                              setDrafts((p) => ({ ...p, [sub.id]: e.target.value }))
                            }
                            onBlur={() => {
                              const d = drafts[sub.id];
                              if (
                                d !== undefined &&
                                d !== String(sub.monthly_budget ?? "")
                              )
                                saveSubBudget(sub.id, toMonthly(sub.id, d));
                            }}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
