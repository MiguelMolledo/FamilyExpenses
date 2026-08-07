"use client";

import { useMemo, useState } from "react";
import { FilterBar, fold } from "@/components/filter-bar";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addMonths, monthEnd } from "@/lib/budget";
import { eur, type Category, type RecurringExpense, type Subcategory } from "@/lib/types";
import { CategorySubcategorySelect } from "@/components/category-select";
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
  subcategories,
  upcoming = {},
  month,
}: {
  expenses: ExpenseRow[];
  categories: Category[];
  subcategories: Subcategory[];
  upcoming?: Record<string, Upcoming>;
  month: string;
}) {
  const total = expenses.reduce((s, e) => s + e.provision, 0);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");

  // Filtro + agrupación alfabética por categoría; fijos por nombre dentro
  const groups = useMemo(() => {
    const catById = new Map(categories.map((c) => [c.id, c.name]));
    const q = fold(query.trim());
    const visible = expenses.filter((e) => {
      if (catFilter === "none" && e.category_id) return false;
      if (catFilter && catFilter !== "none" && e.category_id !== catFilter)
        return false;
      if (!q) return true;
      const catName = catById.get(e.category_id ?? "") ?? "";
      return fold(`${e.name} ${catName}`).includes(q);
    });
    const byCat = new Map<string, ExpenseRow[]>();
    for (const e of visible) {
      const name = catById.get(e.category_id ?? "") ?? "Sin categoría";
      byCat.set(name, [...(byCat.get(name) ?? []), e]);
    }
    return [...byCat.entries()]
      .sort(([a], [b]) =>
        a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b, "es")
      )
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => a.name.localeCompare(b.name, "es")),
        subtotal: items.reduce((s, e) => s + e.provision, 0),
      }));
  }, [expenses, query, catFilter, categories]);

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
          <ExpenseDialog
            categories={categories}
            subcategories={subcategories}
            month={month}
          >
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Añadir
            </Button>
          </ExpenseDialog>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {expenses.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Aún no hay gastos fijos. Añade el primero (alquiler, luz, gas…).
          </p>
        ) : (
          <FilterBar
            query={query}
            onQuery={setQuery}
            categoryId={catFilter}
            onCategory={setCatFilter}
            categories={categories}
          />
        )}
        {expenses.length > 0 && groups.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            Nada coincide con el filtro.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.name} className="flex flex-col divide-y">
            <div className="flex items-center justify-between py-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.name}
              </p>
              <span className="text-xs font-medium text-muted-foreground">
                {eur(g.subtotal)}/mes
              </span>
            </div>
            {g.items.map((e) => (
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
                    {e.realSpent > 0 &&
                      ` · gastado este mes: ${eur(e.realSpent)}`}
                  </p>
                </div>
                <span className="font-semibold">{eur(e.provision)}</span>
                <ExpenseDialog
                  categories={categories}
                  subcategories={subcategories}
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
  subcategories,
  month,
  expense,
  pending,
  children,
}: {
  categories: Category[];
  subcategories: Subcategory[];
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
  const [subcategoryId, setSubcategoryId] = useState(
    expense?.subcategory_id ?? ""
  );
  // Al editar: desde cuándo aplica el cambio (versionado a futuro)
  const [effective, setEffective] = useState<"now" | "next">("next");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      subcategory_id: subcategoryId || null,
    };

    let error = null;
    const done: string[] = [];
    if (!expense) {
      ({ error } = await supabase
        .from("recurring_expenses")
        .insert({ ...payload, starts_on: month }));
      done.push("gasto fijo añadido");
    } else {
      // Nombre y categoría son la identidad del fijo: cambian al momento en
      // TODAS sus versiones (pasadas, la vigente y la programada). Solo el
      // importe/periodo se versiona.
      const identityChanged =
        payload.name !== expense.name ||
        (payload.category_id ?? null) !== (expense.category_id ?? null) ||
        (payload.subcategory_id ?? null) !== (expense.subcategory_id ?? null);
      const economicChanged =
        payload.amount !== expense.amount || payload.period !== expense.period;

      if (identityChanged) {
        ({ error } = await supabase
          .from("recurring_expenses")
          .update({
            name: payload.name,
            category_id: payload.category_id,
            subcategory_id: payload.subcategory_id,
          })
          .eq("name", expense.name));
        done.push("nombre y categoría actualizados ya en todos los meses");
      }
      if (!error && economicChanged) {
        if (effective === "now") {
          ({ error } = await supabase
            .from("recurring_expenses")
            .update({ amount: payload.amount, period: payload.period })
            .eq("id", expense.id));
          done.push("importe corregido en este mes");
        } else if (pending) {
          // Ya hay una versión futura: se edita esa, nunca se crea otra
          ({ error } = await supabase
            .from("recurring_expenses")
            .update({ amount: payload.amount, period: payload.period })
            .eq("id", pending.id));
          done.push(
            `importe desde el 1 de ${monthLabel(pending.starts_on)} (este mes sigue igual)`
          );
        } else {
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
          done.push(
            `importe desde el 1 de ${monthLabel(nextMonth)} (este mes sigue igual)`
          );
        }
      }
    }

    setSaving(false);
    if (error) return void toast.error("No se pudo guardar: " + error.message);
    if (done.length === 0) {
      toast.info("No había cambios que guardar");
    } else {
      const msg = done.join("; ");
      toast.success(
        `Guardado: ${msg.charAt(0).toUpperCase()}${msg.slice(1)}`,
        { duration: 6000 }
      );
    }
    setOpen(false);
    router.refresh();
  }

  async function finish() {
    setSaving(true);
    const supabase = createClient();
    // Finalizar también anula el cambio programado, si lo hay: un fijo
    // finalizado no debe resucitar el mes que viene con la versión futura.
    let error = pending
      ? (await supabase.from("recurring_expenses").delete().eq("id", pending.id))
          .error
      : null;
    if (!error) {
      ({ error } = await supabase
        .from("recurring_expenses")
        .update({ ends_on: monthEnd(month) })
        .eq("id", expense!.id));
    }
    setSaving(false);
    if (error) return void toast.error("No se pudo finalizar");
    toast.success(
      `Finalizado: este mes aún se provisiona, desde el 1 de ${monthLabel(
        addMonths(month, 1)
      )} desaparece de la lista.`,
      { duration: 6000 }
    );
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    setSaving(true);
    const supabase = createClient();
    let error = pending
      ? (await supabase.from("recurring_expenses").delete().eq("id", pending.id))
          .error
      : null;
    if (!error) {
      ({ error } = await supabase
        .from("recurring_expenses")
        .delete()
        .eq("id", expense!.id));
    }
    setSaving(false);
    if (error) return void toast.error("No se pudo eliminar: " + error.message);
    toast.success("Gasto fijo eliminado");
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
            <Label>Categoría y subcategoría</Label>
            <CategorySubcategorySelect
              categories={categories}
              subcategories={subcategories}
              kind="expense"
              categoryId={categoryId || null}
              subcategoryId={subcategoryId || null}
              onChange={(cat, sub) => {
                setCategoryId(cat ?? "");
                setSubcategoryId(sub ?? "");
              }}
            />
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
              <Label>¿Desde cuándo aplica el importe?</Label>
              <p className="text-xs text-muted-foreground">
                El nombre y la categoría se cambian siempre al momento, en
                todos los meses. Esto solo afecta al importe y al periodo.
              </p>
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
            <>
              <Button variant="outline" onClick={finish} disabled={saving}>
                Finalizar (deja de provisionarse el mes que viene)
              </Button>
              {!confirmDelete ? (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                >
                  Eliminar del todo…
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    Solo para fijos creados por error: se borra también de los
                    meses pasados y sus movimientos vinculados pasan a contar
                    como gasto extra. Si el fijo era real y simplemente se
                    acaba, usa «Finalizar».
                  </p>
                  <Button variant="destructive" onClick={remove} disabled={saving}>
                    Sí, eliminar definitivamente
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
