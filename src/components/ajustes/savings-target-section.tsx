"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { SavingsPlan } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SavingsTargetSection({ plan }: { plan: SavingsPlan | null }) {
  const router = useRouter();
  const [value, setValue] = useState(String(plan?.monthly_target ?? 0));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await createClient()
      .from("savings_plans")
      .update({ monthly_target: Number(value) || 0 })
      .eq("family_id", plan!.family_id);
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar");
    toast.success("Objetivo de ahorro actualizado");
    router.refresh();
  }

  if (!plan) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ahorro mensual</CardTitle>
        <CardDescription>
          Cifra que apartáis a la hucha cada mes. Cuenta como provisión en el
          presupuesto.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="10"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-32"
        />
        <span className="text-sm text-muted-foreground">€/mes</span>
        <Button onClick={save} disabled={saving} className="ml-auto">
          Guardar
        </Button>
      </CardContent>
    </Card>
  );
}
