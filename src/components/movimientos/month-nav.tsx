"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths } from "@/lib/budget";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MonthNav({
  month,
  base = "/movimientos",
  className,
}: {
  month: string;
  base?: string;
  className?: string;
}) {
  const label = new Date(month + "T00:00:00").toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className={cn(
        "flex items-center justify-between @3xl:justify-center @3xl:gap-1",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        render={<Link href={`${base}?mes=${addMonths(month, -1)}`} />}
      >
        <ChevronLeft className="size-5" />
      </Button>
      <span className="font-medium capitalize @3xl:min-w-44 @3xl:text-center">
        {label}
      </span>
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
