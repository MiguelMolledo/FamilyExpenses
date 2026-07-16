import { createClient } from "@/lib/supabase/server";
import { eur, type SavingsMovement } from "@/lib/types";
import { SavingsMovementDialog } from "@/components/hucha/savings-movement-dialog";
import { MovementsList } from "@/components/hucha/movements-list";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PiggyBank, Plus } from "lucide-react";

export default async function HuchaPage() {
  const supabase = await createClient();
  const [accountQ, movementsQ, planQ] = await Promise.all([
    supabase.from("savings_accounts").select("*").limit(1).single(),
    supabase
      .from("savings_movements")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("savings_plans").select("*").maybeSingle(),
  ]);

  const movements = (movementsQ.data ?? []) as SavingsMovement[];
  const balance = movements.reduce((s, m) => s + Number(m.amount), 0);
  const target = Number(planQ.data?.monthly_target ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hucha</h1>
        {accountQ.data && (
          <SavingsMovementDialog
            accountId={accountQ.data.id}
            monthlyTarget={target}
            currentBalance={balance}
          >
            <Button size="sm">
              <Plus className="size-4" />
              Movimiento
            </Button>
          </SavingsMovementDialog>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 text-center">
          <PiggyBank className="mx-auto mb-1 size-8 text-pink-500" />
          <p className="text-sm text-muted-foreground">Ahorrado</p>
          <p className="text-4xl font-bold">{eur(balance)}</p>
          {target > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Objetivo: {eur(target)} al mes
            </p>
          )}
        </CardContent>
      </Card>

      <MovementsList movements={movements} />
    </div>
  );
}
