"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addMonths, monthEnd } from "@/lib/budget";
import { eur, type Category, type RecurringExpense } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ExpenseRow = RecurringExpense & { provision: number; realSpent: number };

/** Versión futura pendiente de un fijo (cambio programado). */
type Upcoming = {
  id: string;
  name: string;
  amount: number;
  period: "monthly" | "annual";
  starts_on: string;
};

function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { month: "long" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

export function RecurringExpenses({
  expenses,
  categories,
  upcoming = {},
  month,
}: {
  expenses: ExpenseRow[];
  categories: Category[];
  upcoming?: Record<string, Upcoming>;
  month: string;
}) {
  const total = expenses.reduce((s, e) => s + e.provision, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gastos fijos</CardTitle>
            <CardDescription>
              Provisión mensual total: {eur(total)}
            </CardDescription>
          </div>
          <ExpenseDialog categories={categories} month={month}>
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Añadir
            </Button>
          </ExpenseDialog>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {expenses.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            Aún no hay gastos fijos. Añade el primero (alquiler, luz, gas…).
          </p>
        )}
        {expenses.map((e) => (
          <div key={e.id} className="flex items-center gap-2 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="flex items-center gap-1.5 truncate font-medium">
                {e.name}
                {upcoming[e.id] && <UpcomingBadge change={upcoming[e.id]} />}
              </p>
              <p className="text-xs text-muted-foreground">
                {e.period === "annual"
                  ? `${eur(e.amount)}/año → ${eur(e.provision)}/mes`
                  : `${eur(e.amount)}/mes`}
                {e.realSpent > 0 && ` · gastado este mes: ${eur(e.realSpent)}`}
              </p>
            </div>
            <span className="font-semibold">{eur(e.provision)}</span>
            <ExpenseDialog
              categories={categories}
              month={month}
              expense={e}
              pending={upcoming[e.id]}
            >
              <Button size="icon" variant="ghost">
                <Pencil className="size-4" />
              </Button>
            </ExpenseDialog>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Aviso de cambio programado: toque/click abre el detalle. */
function UpcomingBadge({ change }: { change: Upcoming }) {
  const label = monthLabel(change.starts_on);
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="shrink-0 text-amber-500"
            title={`Cambio programado desde ${label}`}
            aria-label="Ver cambio programado"
          >
            <TriangleAlert className="size-4" />
          </button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambio programado</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Desde el 1 de {label} este fijo pasa a ser:
        </p>
        <p className="font-medium">
          {change.name} ·{" "}
          {change.period === "annual"
            ? `${eur(change.amount)}/año (${eur(change.amount / 12)}/mes)`
            : `${eur(change.amount)}/mes`}
        </p>
        <p className="text-xs text-muted-foreground">
          Hasta entonces sigue aplicando la versión actual. Para cambiarlo ya,
          edita el fijo y elige «Corregir este mes».
        </p>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({
  categories,
  month,
  expense,
  pending,
  children,
}: {
  categories: Category[];
  month: string;
  expense?: ExpenseRow;
  pending?: Upcoming;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Si hay un cambio programado, el diálogo parte de él: es el estado que
  // el usuario quiere que acabe aplicando.
  const [name, setName] = useState(pending?.name ?? expense?.name ?? "");
  const [amount, setAmount] = useState(
    pending ? String(pending.amount) : expense ? String(expense.amount) : ""
  );
  const [period, setPeriod] = useState<"monthly" | "annual">(
    pending?.period ?? expense?.period ?? "monthly"
  );
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  // Al editar: desde cuándo aplica el cambio (versionado a futuro)
  const [effective, setEffective] = useState<"now" | "next">("next");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !Number(amount)) {
      toast.error("Nombre e importe son obligatorios");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: name.trim(),
      amount: Number(amount),
      period,
      category_id: categoryId || null,
    };

    let error = null;
    if (!expense) {
      ({ error } = await supabase
        .from("recurring_expenses")
        .insert({ ...payload, starts_on: month }));
    } else if (effective === "now") {
      // Corregir la versión vigente en el propio mes
      ({ error } = await supabase
        .from("recurring_expenses")
        .update(payload)
        .eq("id", expense.id));
    } else if (pending) {
      // Ya hay una versión futura: se edita esa, nunca se crea otra
      ({ error } = await supabase
        .from("recurring_expenses")
        .update(payload)
        .eq("id", pending.id));
    } else {
      // Cambio a futuro: cerrar la versión actual y abrir una nueva
      const nextMonth = addMonths(month, 1);
      ({ error } = await supabase
        .from("recurring_expenses")
        .update({ ends_on: monthEnd(month) })
        .eq("id", expense.id));
      if (!error) {
        ({ error } = await supabase
          .from("recurring_expenses")
          .insert({ ...payload, starts_on: nextMonth, supersedes_id: expense.id }));
      }
    }

    setSaving(false);
    if (error) return void toast.error("No se pudo guardar: " + error.message);
    toast.success(
      !expense
        ? "Gasto fijo añadido"
        : effective === "now"
          ? "Corregido: aplica ya en este mes"
          : `Guardado: se aplicará desde el 1 de ${monthLabel(addMonths(month, 1))}. Este mes sigue igual.`,
      { duration: 6000 }
    );
    setOpen(false);
    router.refresh();
  }

  async function finish() {
    setSaving(true);
    const { error } = await createClient()
      .from("recurring_expenses")
      .update({ ends_on: monthEnd(month) })
      .eq("id", expense!.id);
    setSaving(false);
    if (error) return void toast.error("No se pudo finalizar");
    toast.success("Gasto fijo finalizado: deja de provisionarse el mes que viene");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span>{children}</span>} />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {expense ? "Editar gasto fijo" : "Nuevo gasto fijo"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Nombre</Label>
            <Input
              placeholder="Gas, Alquiler, Seguro coche…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label>Importe (€)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Periodo</Label>
              <Select
                value={period}
                items={{ monthly: "al mes", annual: "al año" }}
                onValueChange={(v) => setPeriod(v as "monthly" | "annual")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">al mes</SelectItem>
                  <SelectItem value="annual">al año</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {period === "annual" && Number(amount) > 0 && (
            <p className="text-sm text-muted-foreground">
              Se provisionarán {eur(Number(amount) / 12)} cada mes.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label>Categoría</Label>
            <Select
              value={categoryId}
              items={Object.fromEntries(categories.map((c) => [c.id, c.name]))}
              onValueChange={(v) => setCategoryId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {expense && pending && (
            <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
              Ya hay un cambio programado desde el 1 de{" "}
              {monthLabel(pending.starts_on)} ({pending.name},{" "}
              {eur(pending.amount)}
              {pending.period === "annual" ? "/año" : "/mes"}). Guardar «desde
              el mes que viene» lo reemplaza; no se crea otro.
            </p>
          )}
          {expense && (
            <div className="flex flex-col gap-2">
              <Label>¿Desde cuándo aplica?</Label>
              <Select
                value={effective}
                items={{
                  next: "Desde el mes que viene",
                  now: "Corregir este mes",
                }}
                onValueChange={(v) => setEffective(v as "now" | "next")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="next">
                    Desde el mes que viene (recomendado)
                  </SelectItem>
                  <SelectItem value="now">
                    Corregir este mes (edita la versión actual)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          {expense && (
            <Button variant="outline" onClick={finish} disabled={saving}>
              Finalizar este gasto fijo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
