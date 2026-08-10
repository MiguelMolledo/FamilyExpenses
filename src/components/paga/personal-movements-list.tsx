"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteRow } from "@/lib/delete-row";
import { signedEur, shortDate, type PersonalMovement } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<PersonalMovement["kind"], string> = {
  expense: "Gasto",
  extra: "Ingreso extra",
  adjustment: "Ajuste",
};

export function PersonalMovementsList({
  movements,
}: {
  movements: PersonalMovement[];
}) {
  const router = useRouter();

  async function remove(id: string) {
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    const { error } = await deleteRow("personal_movements", id);
    if (error) return void toast.error("No se pudo eliminar");
    toast.success("Movimiento eliminado");
    router.refresh();
  }

  if (movements.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Sin movimientos todavía. La paga se acumula sola cada mes.
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
                {shortDate(m.date, { year: true })}
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
              {signedEur(Number(m.amount))}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar movimiento"
              onClick={() => remove(m.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
