"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function label(month: string): string {
  return new Date(month + "T00:00:00").toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
}

/** Dos selectores de mes (histórico completo) que actualizan la URL. */
export function MonthPickers({
  months,
  a,
  b,
}: {
  months: string[];
  a: string;
  b: string;
}) {
  const router = useRouter();
  const items = Object.fromEntries(months.map((m) => [m, label(m)]));

  function nav(nextA: string, nextB: string) {
    router.push(`/comparar?a=${nextA}&b=${nextB}`);
  }

  return (
    <div className="flex items-center gap-2 @3xl:max-w-2xl">
      <Select value={a} items={items} onValueChange={(v) => v && nav(v, b)}>
        <SelectTrigger className="h-9 flex-1 capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m} className="capitalize">
              {label(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground">vs</span>
      <Select value={b} items={items} onValueChange={(v) => v && nav(a, v)}>
        <SelectTrigger className="h-9 flex-1 capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m} className="capitalize">
              {label(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
