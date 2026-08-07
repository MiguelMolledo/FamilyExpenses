"use client";

import type { Category, Subcategory } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Selector en cascada categoría → subcategoría, filtrado por tipo.
 * Una categoría aparece si tiene alguna subcategoría del tipo pedido;
 * la subcategoría se elige entre las de la categoría seleccionada.
 */
export function CategorySubcategorySelect({
  categories,
  subcategories,
  kind,
  categoryId,
  subcategoryId,
  onChange,
  className,
}: {
  categories: Category[];
  subcategories: Subcategory[];
  kind: "expense" | "income";
  categoryId: string | null;
  subcategoryId: string | null;
  onChange: (categoryId: string | null, subcategoryId: string | null) => void;
  className?: string;
}) {
  const subsOfKind = subcategories.filter((s) => s.kind === kind);
  const catIdsWithKind = new Set(subsOfKind.map((s) => s.category_id));
  const shownCategories = categories.filter(
    (c) => catIdsWithKind.has(c.id) || c.id === categoryId
  );
  const shownSubs = categoryId
    ? subsOfKind.filter((s) => s.category_id === categoryId)
    : [];

  return (
    <div className="flex gap-2">
      <Select
        value={categoryId ?? ""}
        items={{
          "": "Sin categoría",
          ...Object.fromEntries(shownCategories.map((c) => [c.id, c.name])),
        }}
        onValueChange={(v) => onChange(v || null, null)}
      >
        <SelectTrigger className={className ?? "flex-1"}>
          <SelectValue placeholder="Sin categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Sin categoría</SelectItem>
          {shownCategories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={subcategoryId ?? ""}
        items={{
          "": "Subcategoría",
          ...Object.fromEntries(shownSubs.map((s) => [s.id, s.name])),
        }}
        onValueChange={(v) => onChange(categoryId, v || null)}
        disabled={!categoryId || shownSubs.length === 0}
      >
        <SelectTrigger className={className ?? "flex-1"}>
          <SelectValue placeholder="Subcategoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Sin subcategoría</SelectItem>
          {shownSubs.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
