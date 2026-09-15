"use client";

import { Search } from "lucide-react";
import { type Category } from "@/lib/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sin acentos y en minúsculas, para buscar sin exactitudes. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function FilterBar({
  query,
  onQuery,
  categoryId,
  onCategory,
  categories,
}: {
  query: string;
  onQuery: (q: string) => void;
  categoryId: string;
  onCategory: (id: string) => void;
  categories: Category[];
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar…"
          className="h-9 pl-8"
        />
      </div>
      <Select
        value={categoryId}
        items={{
          "": "Todas",
          ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
          none: "Sin categoría",
        }}
        onValueChange={(v) => onCategory(v ?? "")}
      >
        <SelectTrigger className="h-9 w-36 shrink-0 text-xs @3xl:w-52 @3xl:text-sm">
          <SelectValue placeholder="Categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Todas</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
          <SelectItem value="none">Sin categoría</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
