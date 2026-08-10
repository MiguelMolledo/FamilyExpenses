"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { eur, parseAmount, todayMadrid } from "@/lib/types";
import { AmountInput } from "@/components/amount-input";
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

type Kind = "expense" | "extra" | "set_balance";

export function PersonalMovementDialog({
  profileId,
  profileName,
  currentBalance,
  children,
}: {
  profileId: string;
  profileName: string;
  currentBalance: number;
  children: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayMadrid());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (o) {
      // Estado limpio en cada apertura
      setKind("expense");
      setAmount("");
      setDate(todayMadrid());
      setNote("");
    }
  }

  function onKindChange(k: Kind) {
    setKind(k);
    setAmount(k === "set_balance" ? String(currentBalance) : "");
  }

  async function save() {
    const value = parseAmount(amount);
    if (!amount || isNaN(value)) return void toast.error("Importe no válido");

    // "Actualizar saldo" = ajuste por diferencia con el saldo calculado
    const isSet = kind === "set_balance";
    const insertAmount = isSet
      ? value - currentBalance
      : kind === "expense"
        ? -Math.abs(value)
        : Math.abs(value);
    if (insertAmount === 0) return void toast.error("El saldo ya es ese");

    setSaving(true);
    const { error } = await createClient().from("personal_movements").insert({
      profile_id: profileId,
      date,
      amount: insertAmount,
      kind: isSet ? "adjustment" : kind,
      note: note.trim() || (isSet ? "Actualización de saldo" : null),
    });
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar: " + error.message);
    toast.success("Movimiento registrado");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={children} />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Paga de {profileName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Tipo</Label>
            <Select
              value={kind}
              items={{
                expense: "Gasto",
                extra: "Ingreso extra",
                set_balance: "Actualizar saldo",
              }}
              onValueChange={(v) => onKindChange(v as Kind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Gasto</SelectItem>
                <SelectItem value="extra">Ingreso extra</SelectItem>
                <SelectItem value="set_balance">Actualizar saldo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label>
                {kind === "set_balance" ? "Nuevo saldo (€)" : "Importe (€)"}
              </Label>
              <AmountInput
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
              como ajuste. Útil para arrancar con lo que ya tengas ahorrado.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label>Nota (opcional)</Label>
            <Input
              placeholder="Zapatillas, cena con amigos…"
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
