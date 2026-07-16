"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { eur, type SavingsMovement } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<SavingsMovement["kind"], string> = {
  monthly: "Aportación mensual",
  extra: "Aportación extra",
  withdrawal: "Retirada",
  interest: "Intereses / ajuste",
};

export function MovementsList({ movements }: { movements: SavingsMovement[] }) {
  const router = useRouter();

  async function remove(id: string) {
    const { error } = await createClient()
      .from("savings_movements")
      .delete()
      .eq("id", id);
    if (error) return void toast.error("No se pudo eliminar");
    router.refresh();
  }

  if (movements.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          La hucha está vacía. Registra la primera aportación.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col divide-y pt-2">
        {movements.map((m) => (
          <div key={m.id} className="flex items-center gap-2 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">
                {m.note || KIND_LABELS[m.kind]}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(m.date + "T00:00:00").toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {" · "}
                {KIND_LABELS[m.kind]}
              </p>
            </div>
            <span
              className={cn(
                "font-semibold",
                Number(m.amount) >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {Number(m.amount) >= 0 ? "+" : ""}
              {eur(Number(m.amount))}
            </span>
            <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
