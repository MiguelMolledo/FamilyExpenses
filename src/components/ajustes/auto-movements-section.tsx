"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { activeInMonth, monthEnd } from "@/lib/budget";
import {
  currentMonthStart,
  eur,
  parseAmount,
  type AutoMovement,
  type Category,
  type Subcategory,
} from "@/lib/types";
import { CategorySubcategorySelect } from "@/components/category-select";
import { AmountInput } from "@/components/amount-input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AutoMovementsSection({
  autoMovements,
  categories,
  subcategories,
}: {
  autoMovements: AutoMovement[];
  categories: Category[];
  subcategories: Subcategory[];
}) {
  const router = useRouter();
  const month = currentMonthStart();
  const active = autoMovements.filter((m) => activeInMonth(m, month));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function add() {
    const value = parseAmount(amount);
    if (!name.trim() || !Number.isFinite(value) || value <= 0) {
      return void toast.error("Nombre e importe son obligatorios");
    }
    setSaving(true);
    const { error } = await createClient().from("auto_movements").insert({
      name: name.trim(),
      amount: value,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      starts_on: month,
    });
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar: " + error.message);
    toast.success("Desde este mes se generará solo cada día 1");
    setName("");
    setAmount("");
    setCategoryId(null);
    setSubcategoryId(null);
    router.refresh();
  }

  async function saveAmount(m: AutoMovement) {
    const value = parseAmount(amounts[m.id] ?? "");
    if (!Number.isFinite(value) || value <= 0) return;
    if (value === Number(m.amount)) return;
    const { error } = await createClient()
      .from("auto_movements")
      .update({ amount: value })
      .eq("id", m.id);
    if (error) return void toast.error("No se pudo guardar");
    toast.success(
      "Importe actualizado (los meses ya generados no se tocan)"
    );
    router.refresh();
  }

  async function finish(m: AutoMovement) {
    if (
      !window.confirm(
        `¿Finalizar «${m.name}»? Este mes ya cuenta; a partir del que viene deja de generarse.`
      )
    )
      return;
    const { error } = await createClient()
      .from("auto_movements")
      .update({ ends_on: monthEnd(month) })
      .eq("id", m.id);
    if (error) return void toast.error("No se pudo finalizar");
    toast.success("Finalizado: el mes que viene ya no se genera");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos automáticos</CardTitle>
        <CardDescription>
          Gastos reales que no pasan por la cuenta común (p.ej. la derrama que
          paga uno aparte y por eso ingresa menos). Se generan solos cada mes
          como gasto fijo. Ojo: el ingreso previsto correspondiente debe ir por
          el importe completo, sin descontarlos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {active.length > 0 && (
          <div className="flex flex-col gap-2">
            {active.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.category_id
                      ? (catName.get(m.category_id) ?? "Sin categoría")
                      : "Sin categoría"}{" "}
                    · desde{" "}
                    {new Date(m.starts_on + "T00:00:00").toLocaleDateString(
                      "es-ES",
                      { month: "short", year: "numeric" }
                    )}
                  </p>
                </div>
                <AmountInput
                  className="h-8 w-24 text-right text-sm"
                  defaultValue={String(Number(m.amount)).replace(".", ",")}
                  onChange={(e) =>
                    setAmounts((p) => ({ ...p, [m.id]: e.target.value }))
                  }
                  onBlur={() => amounts[m.id] !== undefined && saveAmount(m)}
                />
                <span className="text-xs text-muted-foreground">€/mes</span>
                <Button size="sm" variant="outline" onClick={() => finish(m)}>
                  Finalizar
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Nuevo movimiento automático</p>
          <div className="flex gap-2">
            <Input
              placeholder="Derrama del piso"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <AmountInput
              placeholder="€/mes"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 text-right"
            />
          </div>
          <CategorySubcategorySelect
            categories={categories}
            subcategories={subcategories}
            kind="expense"
            categoryId={categoryId}
            subcategoryId={subcategoryId}
            onChange={(cat, sub) => {
              setCategoryId(cat);
              setSubcategoryId(sub);
            }}
          />
          <Button size="sm" onClick={add} disabled={saving}>
            Añadir (aplica desde este mes)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
