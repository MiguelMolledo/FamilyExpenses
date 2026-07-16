"use client";

import type { ConceptDeviation } from "@/lib/budget";
import { eur } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Deviations({ deviations }: { deviations: ConceptDeviation[] }) {
  const withData = deviations.filter((d) => d.realYtd > 0);
  if (withData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Desviación anual por concepto</CardTitle>
        <CardDescription>
          Provisionado en lo que va de año vs gastado de verdad. En negativo:
          estás gastando más de lo que reservas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {withData.map((d) => (
          <div key={d.name} className="flex items-center gap-2 py-2">
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{d.name}</p>
              <p className="text-xs text-muted-foreground">
                Reservado {eur(d.provisionYtd)} · gastado {eur(d.realYtd)}
              </p>
            </div>
            <span
              className={cn(
                "font-semibold",
                d.deviation < 0 ? "text-red-600" : "text-green-600"
              )}
            >
              {d.deviation >= 0 ? "+" : ""}
              {eur(d.deviation)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
