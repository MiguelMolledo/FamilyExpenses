"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { activeInMonth, addMonths, monthEnd } from "@/lib/budget";
import {
  monthStart,
  type PersonalAllowance,
  type Profile,
} from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PersonalAllowancesSection({
  members,
  allowances,
}: {
  members: Profile[];
  allowances: PersonalAllowance[];
}) {
  const router = useRouter();
  const month = monthStart(new Date());
  const activeByProfile = new Map(
    allowances
      .filter((a) => activeInMonth(a, month) && !a.ends_on)
      .map((a) => [a.profile_id, a])
  );

  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      members.map((m) => [
        m.user_id,
        String(Number(activeByProfile.get(m.user_id)?.amount ?? 0)),
      ])
    )
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(profileId: string) {
    const value = Number(values[profileId]) || 0;
    const active = activeByProfile.get(profileId);
    if (Number(active?.amount ?? 0) === value) return;

    setSavingId(profileId);
    const supabase = createClient();
    let error = null;

    if (active && active.starts_on >= month) {
      // La versión vigente empezó este mes: se corrige en sitio
      if (value > 0) {
        ({ error } = await supabase
          .from("personal_allowances")
          .update({ amount: value })
          .eq("id", active.id));
      } else {
        ({ error } = await supabase
          .from("personal_allowances")
          .delete()
          .eq("id", active.id));
      }
    } else {
      if (active) {
        // Cerrar la versión vigente a fin del mes pasado
        ({ error } = await supabase
          .from("personal_allowances")
          .update({ ends_on: monthEnd(addMonths(month, -1)) })
          .eq("id", active.id));
      }
      if (!error && value > 0) {
        ({ error } = await supabase.from("personal_allowances").insert({
          profile_id: profileId,
          amount: value,
          starts_on: month,
        }));
      }
    }

    setSavingId(null);
    if (error) return void toast.error("No se pudo guardar: " + error.message);
    toast.success("Paga actualizada desde este mes");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagas personales</CardTitle>
        <CardDescription>
          Dinero mensual de cada uno para sus cosas. No pasa por la cuenta
          común: registrad la nómina ya sin la paga. El cambio aplica desde
          este mes y lo ya devengado no se toca.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2">
            <span className="flex-1 text-sm font-medium">{m.display_name}</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="10"
              value={values[m.user_id] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [m.user_id]: e.target.value }))
              }
              className="max-w-28"
            />
            <span className="text-sm text-muted-foreground">€/mes</span>
            <Button
              size="sm"
              onClick={() => save(m.user_id)}
              disabled={savingId === m.user_id}
            >
              Guardar
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
