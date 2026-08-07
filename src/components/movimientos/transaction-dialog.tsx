"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  eur,
  type Category,
  type Pet,
  type Profile,
  type RecurringIncome,
  type Subcategory,
  type Transaction,
} from "@/lib/types";
import { CategorySubcategorySelect } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function TransactionDialog({
  month,
  categories,
  subcategories,
  recurringIncomes,
  pets,
  profiles,
  transaction,
  children,
}: {
  month: string;
  categories: Category[];
  subcategories: Subcategory[];
  recurringIncomes: RecurringIncome[];
  pets: Pet[];
  profiles: Profile[];
  transaction?: Transaction;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = today.slice(0, 7) === month.slice(0, 7) ? today : month;

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"expense" | "income">(
    transaction?.type ?? "expense"
  );
  const [date, setDate] = useState(transaction?.date ?? defaultDate);
  const [amount, setAmount] = useState(
    transaction ? String(transaction.amount) : ""
  );
  const [description, setDescription] = useState(
    transaction?.description ?? ""
  );
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(
    transaction?.subcategory_id ?? ""
  );
  const [isFixed, setIsFixed] = useState(transaction?.is_fixed ?? false);
  const [recurringId, setRecurringId] = useState(
    transaction?.recurring_income_id ?? ""
  );
  const [profileId, setProfileId] = useState(transaction?.profile_id ?? "");
  const [petSplit, setPetSplit] = useState(false);
  const [petAmounts, setPetAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function togglePetSplit(checked: boolean) {
    setPetSplit(checked);
    if (checked && Number(amount) > 0) {
      // Prefill con los % por defecto de cada mascota
      setPetAmounts(
        Object.fromEntries(
          pets.map((p) => [
            p.id,
            ((Number(amount) * Number(p.default_split_pct)) / 100).toFixed(2),
          ])
        )
      );
    }
  }

  async function save() {
    const value = Number(amount);
    if (!value || value <= 0) return void toast.error("Pon un importe válido");
    setSaving(true);
    const supabase = createClient();

    const payload = {
      date,
      amount: value,
      type,
      description: description.trim(),
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
      is_fixed: type === "expense" && isFixed,
      recurring_expense_id: null,
      recurring_income_id: type === "income" ? recurringId || null : null,
      profile_id: profileId || null,
      is_extraordinary: type === "income" && !recurringId,
    };

    let txId = transaction?.id;
    let error = null;
    if (transaction) {
      ({ error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", transaction.id));
    } else {
      const res = await supabase
        .from("transactions")
        .insert(payload)
        .select("id")
        .single();
      error = res.error;
      txId = res.data?.id;
    }

    if (!error && txId) {
      // Reparto entre mascotas: se reescribe entero
      await supabase
        .from("transaction_pet_splits")
        .delete()
        .eq("transaction_id", txId);
      if (petSplit) {
        const rows = pets
          .map((p) => ({
            transaction_id: txId,
            pet_id: p.id,
            amount: Number(petAmounts[p.id]) || 0,
          }))
          .filter((r) => r.amount > 0);
        if (rows.length > 0) {
          ({ error } = await supabase
            .from("transaction_pet_splits")
            .insert(rows));
        }
      }
    }

    setSaving(false);
    if (error) return void toast.error("No se pudo guardar: " + error.message);
    toast.success(transaction ? "Movimiento actualizado" : "Movimiento añadido");
    setOpen(false);
    router.refresh();
  }

  const petTotal = pets.reduce((s, p) => s + (Number(petAmounts[p.id]) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span>{children}</span>} />
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {transaction ? "Editar movimiento" : "Nuevo movimiento"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Tabs
            value={type}
            onValueChange={(v) => {
              setType(v as "expense" | "income");
              setCategoryId("");
              setSubcategoryId("");
              setIsFixed(false);
              setRecurringId("");
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="expense" className="flex-1">
                Gasto
              </TabsTrigger>
              <TabsTrigger value="income" className="flex-1">
                Ingreso
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
              <Label>Fecha</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Descripción</Label>
            <Input
              placeholder="Factura del gas, cena fuera…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Categoría y subcategoría</Label>
            <CategorySubcategorySelect
              categories={categories}
              subcategories={subcategories}
              kind={type}
              categoryId={categoryId || null}
              subcategoryId={subcategoryId || null}
              onChange={(cat, sub) => {
                setCategoryId(cat ?? "");
                setSubcategoryId(sub ?? "");
              }}
            />
          </div>

          {type === "expense" ? (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={isFixed}
                  onCheckedChange={(c) => setIsFixed(c === true)}
                />
                Es un gasto fijo (recibo previsto)
              </label>
              <p className="pl-6 text-xs text-muted-foreground">
                Descuenta igual del presupuesto de su categoría; esto solo marca
                que es un recibo planificado, no un gasto variable.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label>¿Corresponde a un ingreso recurrente?</Label>
              <Select
                value={recurringId}
                items={{
                  "": "No, es extraordinario",
                  ...Object.fromEntries(
                    recurringIncomes.map((r) => [r.id, r.name])
                  ),
                }}
                onValueChange={(v) => setRecurringId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No, es extraordinario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No, es extraordinario</SelectItem>
                  {recurringIncomes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si no lo ligas, cuenta como ingreso extraordinario del mes.
              </p>
            </div>
          )}

          {type === "income" && (
            <div className="flex flex-col gap-2">
              <Label>De quién</Label>
              <Select
                value={profileId}
                items={Object.fromEntries(
                  profiles.map((p) => [p.user_id, p.display_name])
                )}
                onValueChange={(v) => setProfileId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Familiar (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "expense" && pets.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={petSplit}
                  onCheckedChange={(c) => togglePetSplit(c === true)}
                />
                Repartir entre las mascotas
              </label>
              {petSplit && (
                <>
                  {pets.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{p.name}</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        className="w-24"
                        value={petAmounts[p.id] ?? ""}
                        onChange={(e) =>
                          setPetAmounts((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                      />
                      <span className="text-xs text-muted-foreground">€</span>
                    </div>
                  ))}
                  {Math.abs(petTotal - Number(amount)) > 0.01 && (
                    <p className="text-xs text-amber-600">
                      El reparto suma {eur(petTotal)}, el gasto es{" "}
                      {eur(Number(amount) || 0)}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
