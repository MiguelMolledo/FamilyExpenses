"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths } from "@/lib/budget";
import { Button } from "@/components/ui/button";

export function MonthNav({ month, base = "/movimientos" }: { month: string; base?: string }) {
  const label = new Date(month + "T00:00:00").toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        size="icon"
        render={<Link href={`${base}?mes=${addMonths(month, -1)}`} />}
      >
        <ChevronLeft className="size-5" />
      </Button>
      <span className="font-medium capitalize">{label}</span>
      <Button
        variant="ghost"
        size="icon"
        render={<Link href={`${base}?mes=${addMonths(month, 1)}`} />}
      >
        <ChevronRight className="size-5" />
      </Button>
    </div>
  );
}
