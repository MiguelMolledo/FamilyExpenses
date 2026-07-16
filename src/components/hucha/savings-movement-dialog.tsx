"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { eur } from "@/lib/types";
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

type Kind = "monthly" | "extra" | "withdrawal" | "interest" | "set_balance";

export function SavingsMovementDialog({
  accountId,
  monthlyTarget,
  currentBalance,
  children,
}: {
  accountId: string;
  monthlyTarget: number;
  currentBalance: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("monthly");
  const [amount, setAmount] = useState(
    monthlyTarget > 0 ? String(monthlyTarget) : ""
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function onKindChange(k: Kind) {
    setKind(k);
    if (k === "monthly" && monthlyTarget > 0) setAmount(String(monthlyTarget));
    else if (k === "set_balance") setAmount(String(currentBalance));
    else setAmount("");
  }

  async function save() {
    const value = Number(amount);
    if (!amount || isNaN(value)) return void toast.error("Importe no válido");

    // "Actualizar saldo" (ej. tras liquidar intereses) = ajuste por diferencia
    const isSet = kind === "set_balance";
    const insertAmount = isSet
      ? value - currentBalance
      : kind === "withdrawal"
        ? -Math.abs(value)
        : Math.abs(value);
    if (insertAmount === 0) return void toast.error("El saldo ya es ese");

    setSaving(true);
    const { error } = await createClient().from("savings_movements").insert({
      account_id: accountId,
      date,
      amount: insertAmount,
      kind: isSet ? "interest" : kind,
      note: note.trim() || (isSet ? "Actualización de saldo" : null),
    });
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar: " + error.message);
    toast.success("Movimiento registrado");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span>{children}</span>} />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Movimiento de la hucha</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Tipo</Label>
            <Select
              value={kind}
              items={{
                monthly: "Aportación del mes",
                extra: "Aportación extra",
                withdrawal: "Retirada",
                interest: "Intereses",
                set_balance: "Actualizar saldo total",
              }}
              onValueChange={(v) => onKindChange(v as Kind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Aportación del mes</SelectItem>
                <SelectItem value="extra">Aportación extra</SelectItem>
                <SelectItem value="withdrawal">Retirada</SelectItem>
                <SelectItem value="interest">Intereses</SelectItem>
                <SelectItem value="set_balance">
                  Actualizar saldo total
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label>
                {kind === "set_balance" ? "Nuevo saldo (€)" : "Importe (€)"}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
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
          {kind === "set_balance" && (
            <p className="text-xs text-muted-foreground">
              Saldo actual: {eur(currentBalance)}. Se registrará la diferencia
              como ajuste por intereses/rentabilidad.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label>Nota (opcional)</Label>
            <Input
              placeholder="Intereses cuenta remunerada…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
