"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { eur, parseAmount } from "@/lib/types";
import { AmountInput } from "@/components/amount-input";
import type { CategoryBudgetRow } from "@/lib/budget";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    const n = parseAmount(raw);
    return Number.isFinite(n) ? (n / 12).toFixed(2) : raw;
  };

  /** Valor a mostrar en el campo según la unidad activa (anual = mensual ×12) */
  const displayValue = (id: string, monthly: number | null): string | number =>
    monthly == null
      ? ""
      : (units[id] ?? "month") === "year"
        ? Number((monthly * 12).toFixed(2))
        : monthly;

  const UnitToggle = ({ id }: { id: string }) => (
    <button
      type="button"
      className="shrink-0 rounded-md border px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
      title="Cambia si el importe que escribes es mensual o anual (se guarda al mes)"
      onClick={() => {
        setUnits((p) => ({
          ...p,
          [id]: (p[id] ?? "month") === "month" ? "year" : "month",
        }));
        // El campo se remonta con el valor en la nueva unidad: fuera el borrador
        setDrafts((p) => {
          const q = { ...p };
          delete q[id];
          return q;
        });
      }}
    >
      {(units[id] ?? "month") === "month" ? "€/mes" : "€/año ÷12"}
    </button>
  );

  /** Suma de los presupuestos asignados en el desglose de la categoría */
  const subsBudgetSum = (row: CategoryBudgetRow): number =>
    row.subRows.reduce(
      (s, { sub }) =>
        s + (sub.monthly_budget != null ? Number(sub.monthly_budget) : 0),
      0
    );

  async function saveBudget(row: CategoryBudgetRow, raw: string) {
    let value = raw.trim() === "" ? null : parseAmount(raw);
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    // El desglose nunca puede sumar más que el total de la categoría: si lo
    // tecleado se queda corto, el total sube a la suma del desglose
    const subsSum = subsBudgetSum(row);
    let adjusted = false;
    if (value != null && subsSum > value + 0.005) {
      value = Number(subsSum.toFixed(2));
      adjusted = true;
    }
    const { error } = await createClient()
      .from("categories")
      .update({ monthly_budget: value })
      .eq("id", row.category.id);
    if (error) return void toast.error("No se pudo guardar el presupuesto");
    toast.success(
      adjusted
        ? `El desglose suma ${eur(value!)}: el presupuesto se ajusta a esa cantidad`
        : "Presupuesto guardado"
    );
    router.refresh();
  }

  async function saveFlexible(categoryId: string, value: boolean) {
    const { error } = await createClient()
      .from("categories")
      .update({ is_flexible: value })
      .eq("id", categoryId);
    if (error) return void toast.error("No se pudo guardar");
    toast.success(
      value
        ? "Categoría marcada como prescindible"
        : "Categoría marcada como imprescindible"
    );
    router.refresh();
  }

  async function savePrescindible(subId: string, value: boolean) {
    const { error } = await createClient()
      .from("subcategories")
      .update({ prescindible: value })
      .eq("id", subId);
    if (error) return void toast.error("No se pudo guardar");
    toast.success(value ? "Marcada como prescindible" : "Vuelve a ser imprescindible");
    router.refresh();
  }

  async function saveRollover(categoryId: string, rollover: string) {
    const { error } = await createClient()
      .from("categories")
      .update({ rollover })
      .eq("id", categoryId);
    if (error) return void toast.error("No se pudo guardar");
    toast.success("Guardado");
    router.refresh();
  }

  async function saveSubBudget(
    row: CategoryBudgetRow,
    subId: string,
    raw: string
  ) {
    const value = raw.trim() === "" ? null : parseAmount(raw);
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("subcategories")
      .update({ monthly_budget: value })
      .eq("id", subId);
    if (error) return void toast.error("No se pudo guardar el desglose");

    // Si con el cambio el desglose supera el presupuesto de la categoría,
    // el presupuesto sube automáticamente a la suma del desglose
    const newSum = row.subRows.reduce(
      (s, { sub }) =>
        s +
        (sub.id === subId
          ? (value ?? 0)
          : sub.monthly_budget != null
            ? Number(sub.monthly_budget)
            : 0),
      0
    );
    const catOwn =
      row.category.monthly_budget != null
        ? Number(row.category.monthly_budget)
        : null;
    if (catOwn != null && newSum > catOwn + 0.005) {
      const { error: catError } = await supabase
        .from("categories")
        .update({ monthly_budget: Number(newSum.toFixed(2)) })
        .eq("id", row.category.id);
      if (!catError) {
        toast.success(
          `Desglose guardado: el presupuesto de ${row.category.name} sube a ${eur(newSum)}`
        );
        router.refresh();
        return;
      }
    }
    toast.success("Desglose guardado");
    router.refresh();
  }

  const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  // Mayor presupuesto arriba; sin presupuesto (o a cero) al final
  const sortedRows = [...rows].sort(
    (a, b) => (b.budget ?? 0) - (a.budget ?? 0)
  );

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
        {sortedRows.map((r) => {
          const over = r.available != null && r.available < 0;
          const pct =
            r.budget && r.budget > 0
              ? Math.min(100, (r.spent / r.budget) * 100)
              : 0;
          const catOwn =
            r.category.monthly_budget != null
              ? Number(r.category.monthly_budget)
              : null;
          const subsSum = subsBudgetSum(r);
          const unassigned =
            catOwn != null && subsSum > 0 ? catOwn - subsSum : 0;
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
                <AmountInput
                  placeholder={
                    (units[r.category.id] ?? "month") === "month"
                      ? "€/mes"
                      : "€/año"
                  }
                  className="h-8 w-24 text-right text-sm"
                  defaultValue={displayValue(r.category.id, r.budget)}
                  key={`${r.category.id}-${r.budget ?? ""}-${units[r.category.id] ?? "month"}`}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [r.category.id]: e.target.value }))
                  }
                  onBlur={() => {
                    const d = drafts[r.category.id];
                    if (d !== undefined && d !== String(r.budget ?? ""))
                      saveBudget(r, toMonthly(r.category.id, d));
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
                  <div className="flex flex-wrap items-center gap-2">
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
                    <button
                      type="button"
                      className={cn(
                        "flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted",
                        r.category.is_flexible
                          ? "border-amber-400 text-amber-600"
                          : "text-muted-foreground"
                      )}
                      title="Lo prescindible se podría cortar en un bache: no cuenta en el mínimo para vivir"
                      onClick={() =>
                        saveFlexible(r.category.id, !r.category.is_flexible)
                      }
                    >
                      <Scissors className="size-3" />
                      {r.category.is_flexible
                        ? "Toda la categoría es prescindible"
                        : "Categoría imprescindible"}
                    </button>
                  </div>
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
                          <button
                            type="button"
                            className={cn(
                              "shrink-0 rounded-md border p-1 hover:bg-muted",
                              r.category.is_flexible || sub.prescindible
                                ? "border-amber-400 text-amber-600"
                                : "text-muted-foreground/50"
                            )}
                            disabled={r.category.is_flexible}
                            title={
                              r.category.is_flexible
                                ? "Toda la categoría ya está marcada como prescindible"
                                : sub.prescindible
                                  ? "Prescindible: se podría cortar en un bache. Toca para volverla imprescindible"
                                  : "Imprescindible. Toca para marcarla como prescindible"
                            }
                            aria-label={`${sub.name}: ${sub.prescindible ? "prescindible" : "imprescindible"}`}
                            onClick={() =>
                              savePrescindible(sub.id, !sub.prescindible)
                            }
                          >
                            <Scissors className="size-3" />
                          </button>
                          <UnitToggle id={sub.id} />
                          <AmountInput
                            placeholder="—"
                            className="h-7 w-20 text-right text-xs"
                            defaultValue={displayValue(
                              sub.id,
                              sub.monthly_budget
                            )}
                            key={`${sub.id}-${sub.monthly_budget ?? ""}-${units[sub.id] ?? "month"}`}
                            onChange={(e) =>
                              setDrafts((p) => ({ ...p, [sub.id]: e.target.value }))
                            }
                            onBlur={() => {
                              const d = drafts[sub.id];
                              if (
                                d !== undefined &&
                                d !== String(sub.monthly_budget ?? "")
                              )
                                saveSubBudget(r, sub.id, toMonthly(sub.id, d));
                            }}
                          />
                        </>
                      )}
                    </div>
                  ))}
                  {unassigned > 0.005 && (
                    <p
                      className="pt-1 text-xs text-amber-600"
                      title={`Presupuesto de la categoría ${eur(catOwn!)} − desglose asignado ${eur(subsSum)}`}
                    >
                      Te quedan {eur(unassigned)} por asignar en el desglose
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
