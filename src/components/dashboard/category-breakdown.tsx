"use client";

import { useState } from "react";
import { eur } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SubAmount = { name: string; amount: number };

/**
 * Envuelve una fila de leyenda o un segmento de barra del dashboard y muestra
 * un popup instantáneo con el desglose por subcategoría de esa categoría:
 * en escritorio al pasar el ratón (CSS puro), en móvil al tocar (estado).
 */
export function CategoryBreakdown({
  title,
  total,
  subs,
  className,
  popupClassName,
  style,
  children,
}: {
  title: string;
  total: number;
  subs: SubAmount[];
  className?: string;
  popupClassName?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [pinned, setPinned] = useState(false);
  if (subs.length === 0)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );

  return (
    <div
      className={cn("group relative", className)}
      style={style}
      onClick={() => setPinned((p) => !p)}
      onMouseLeave={() => setPinned(false)}
    >
      {children}
      <div
        className={cn(
          "absolute left-0 top-full z-30 mt-1 hidden w-max min-w-52 max-w-72 flex-col gap-1 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg group-hover:flex",
          pinned && "flex",
          popupClassName
        )}
      >
        <div className="flex items-center justify-between gap-4 font-medium">
          <span className="truncate">{title}</span>
          <span>{eur(total)}</span>
        </div>
        {subs.map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between gap-4 text-xs"
          >
            <span className="truncate text-muted-foreground">{s.name}</span>
            <span>{eur(s.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
