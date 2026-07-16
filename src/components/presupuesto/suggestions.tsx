"use client";

import { Lightbulb } from "lucide-react";
import type { Suggestion } from "@/lib/budget";
import { eur } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";

export function Suggestions({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
      <CardContent className="flex flex-col gap-2 pt-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-amber-600" />
          Sugerencias según tu gasto real
        </p>
        {suggestions.map((s) => (
          <p key={s.name} className="text-sm">
            <strong>{s.name}</strong>: provisionas {eur(s.currentAnnual)}
            /año pero tu gasto real apunta a {eur(s.estimatedAnnual)}/año (
            {s.monthsCovered} meses de datos). Considera ajustarlo desde el mes
            que viene.
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
