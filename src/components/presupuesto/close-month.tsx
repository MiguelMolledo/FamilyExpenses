"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MonthBudget } from "@/lib/budget";
import { eur } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function CloseMonth({ budget }: { budget: MonthBudget }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function close() {
    setSaving(true);
    const { error } = await createClient().from("month_closures").insert({
      month: budget.month,
      carryover: budget.available,
      snapshot: {
        expectedIncome: budget.expectedIncome,
        realIncome: budget.realIncome,
        provisions: budget.provisions,
        realExpenses: budget.realExpenses,
        extraExpenses: budget.extraExpenses,
        fixedOverrun: budget.fixedOverrun,
        available: budget.available,
      },
    });
    setSaving(false);
    if (error) return void toast.error("No se pudo cerrar: " + error.message);
    toast.success("Mes cerrado. El sobrante se arrastra al siguiente.");
    router.refresh();
  }

  async function reopen() {
    setSaving(true);
    const { error } = await createClient()
      .from("month_closures")
      .delete()
      .eq("month", budget.month);
    setSaving(false);
    if (error) return void toast.error("No se pudo reabrir");
    toast.success("Mes reabierto");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cierre de mes</CardTitle>
        <CardDescription>
          {budget.closed
            ? "Este mes está cerrado."
            : `Al cerrar, el disponible actual (${eur(budget.available)}) se arrastra como punto de partida del mes siguiente.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {budget.closed ? (
          <Button variant="outline" onClick={reopen} disabled={saving}>
            <LockOpen className="size-4" />
            Reabrir mes
          </Button>
        ) : (
          <Button onClick={close} disabled={saving}>
            <Lock className="size-4" />
            Cerrar {new Date(budget.month).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
