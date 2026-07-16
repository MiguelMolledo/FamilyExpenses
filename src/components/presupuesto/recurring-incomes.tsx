"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addMonths, monthEnd } from "@/lib/budget";
import { eur, type Profile, type RecurringIncome } from "@/lib/types";
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

const TYPE_LABELS: Record<RecurringIncome["type"], string> = {
  salary: "Nómina",
  rent: "Rentas",
  other: "Otro",
};

export function RecurringIncomes({
  incomes,
  profiles,
  month,
}: {
  incomes: RecurringIncome[];
  profiles: Profile[];
  month: string;
}) {
  const total = incomes.reduce((s, i) => s + Number(i.amount), 0);
  const nameByProfile = new Map(profiles.map((p) => [p.user_id, p.display_name]));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Ingresos recurrentes</CardTitle>
            <CardDescription>Total mensual: {eur(total)}</CardDescription>
          </div>
          <IncomeDialog profiles={profiles} month={month}>
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Añadir
            </Button>
          </IncomeDialog>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {incomes.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            Añade las nóminas y otras fuentes de ingreso mensuales.
          </p>
        )}
        {incomes.map((i) => (
          <div key={i.id} className="flex items-center gap-2 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{i.name}</p>
              <p className="text-xs text-muted-foreground">
                {TYPE_LABELS[i.type]}
                {i.profile_id && nameByProfile.get(i.profile_id)
                  ? ` · ${nameByProfile.get(i.profile_id)}`
                  : ""}
              </p>
            </div>
            <span className="font-semibold text-green-600">
              {eur(Number(i.amount))}
            </span>
            <IncomeDialog profiles={profiles} month={month} income={i}>
              <Button size="icon" variant="ghost">
                <Pencil className="size-4" />
              </Button>
            </IncomeDialog>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function IncomeDialog({
  profiles,
  month,
  income,
  children,
}: {
  profiles: Profile[];
  month: string;
  income?: RecurringIncome;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(income?.name ?? "");
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [type, setType] = useState<RecurringIncome["type"]>(
    income?.type ?? "salary"
  );
  const [profileId, setProfileId] = useState(income?.profile_id ?? "");
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
      type,
      profile_id: profileId || null,
    };

    let error = null;
    if (!income) {
      ({ error } = await supabase
        .from("recurring_incomes")
        .insert({ ...payload, starts_on: month }));
    } else if (effective === "now") {
      ({ error } = await supabase
        .from("recurring_incomes")
        .update(payload)
        .eq("id", income.id));
    } else {
      ({ error } = await supabase
        .from("recurring_incomes")
        .update({ ends_on: monthEnd(month) })
        .eq("id", income.id));
      if (!error) {
        ({ error } = await supabase
          .from("recurring_incomes")
          .insert({ ...payload, starts_on: addMonths(month, 1) }));
      }
    }

    setSaving(false);
    if (error) return void toast.error("No se pudo guardar: " + error.message);
    toast.success(income ? "Ingreso actualizado" : "Ingreso añadido");
    setOpen(false);
    router.refresh();
  }

  async function finish() {
    setSaving(true);
    const { error } = await createClient()
      .from("recurring_incomes")
      .update({ ends_on: monthEnd(month) })
      .eq("id", income!.id);
    setSaving(false);
    if (error) return void toast.error("No se pudo finalizar");
    toast.success("Ingreso finalizado");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span>{children}</span>} />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {income ? "Editar ingreso" : "Nuevo ingreso recurrente"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Nombre</Label>
            <Input
              placeholder="Nómina Miguel, Alquiler piso…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label>Importe (€/mes)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as RecurringIncome["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary">Nómina</SelectItem>
                  <SelectItem value="rent">Rentas</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>De quién</Label>
            <Select
              value={profileId}
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
          {income && (
            <div className="flex flex-col gap-2">
              <Label>¿Desde cuándo aplica?</Label>
              <Select
                value={effective}
                onValueChange={(v) => setEffective(v as "now" | "next")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="next">Desde el mes que viene</SelectItem>
                  <SelectItem value="now">Corregir este mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          {income && (
            <Button variant="outline" onClick={finish} disabled={saving}>
              Finalizar este ingreso
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
