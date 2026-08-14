"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Category, Subcategory } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function CategoriesSection({
  categories,
  subcategories,
}: {
  categories: Category[];
  subcategories: Subcategory[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [subName, setSubName] = useState<Record<string, string>>({});
  const [subKind, setSubKind] = useState<Record<string, "expense" | "income">>(
    {}
  );
  const [editing, setEditing] = useState<{
    table: "categories" | "subcategories";
    id: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(
    table: "categories" | "subcategories",
    id: string,
    current: string
  ) {
    setEditing({ table, id });
    setEditValue(current);
  }

  async function saveEdit() {
    if (!editing) return;
    const n = editValue.trim();
    const { table, id } = editing;
    setEditing(null);
    if (!n) return;
    const { error } = await createClient()
      .from(table)
      .update({ name: n })
      .eq("id", id);
    if (error) return void toast.error("No se pudo renombrar (¿ya existe?)");
    router.refresh();
  }

  async function addCategory() {
    if (!name.trim()) return;
    const { error } = await createClient()
      .from("categories")
      .insert({ name: name.trim(), kind: null });
    if (error) return void toast.error("No se pudo añadir (¿ya existe?)");
    setName("");
    router.refresh();
  }

  async function removeCategory(id: string) {
    const { error } = await createClient()
      .from("categories")
      .delete()
      .eq("id", id);
    if (error) return void toast.error("No se pudo eliminar");
    router.refresh();
  }

  async function addSub(categoryId: string) {
    const n = (subName[categoryId] ?? "").trim();
    if (!n) return;
    const { error } = await createClient().from("subcategories").insert({
      category_id: categoryId,
      name: n,
      kind: subKind[categoryId] ?? "expense",
    });
    if (error) return void toast.error("No se pudo añadir (¿ya existe?)");
    setSubName((p) => ({ ...p, [categoryId]: "" }));
    router.refresh();
  }

  async function removeSub(id: string) {
    const { error } = await createClient()
      .from("subcategories")
      .delete()
      .eq("id", id);
    if (error) return void toast.error("No se pudo eliminar");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorías y subcategorías</CardTitle>
        <CardDescription>
          Los movimientos se asignan a una subcategoría; el presupuesto se pone
          en la categoría.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {categories.map((c) => {
          const subs = subcategories.filter((s) => s.category_id === c.id);
          const open = expanded[c.id];
          return (
            <div key={c.id} className="flex flex-col gap-2 border-b py-2 last:border-b-0">
              <div className="flex items-center gap-1">
                {editing?.table === "categories" && editing.id === c.id ? (
                  <Input
                    autoFocus
                    className="h-8 flex-1 text-sm"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    className="flex flex-1 items-center gap-1 text-left text-sm font-medium"
                    onClick={() =>
                      setExpanded((p) => ({ ...p, [c.id]: !p[c.id] }))
                    }
                  >
                    {open ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                    {c.name}
                    <span className="text-xs text-muted-foreground">
                      ({subs.length})
                    </span>
                  </button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit("categories", c.id, c.name)}
                  aria-label={`Renombrar ${c.name}`}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeCategory(c.id)}
                  aria-label={`Eliminar ${c.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {open && (
                <div className="flex flex-col gap-2 pl-5">
                  <div className="flex flex-wrap gap-2">
                    {subs.map((s) =>
                      editing?.table === "subcategories" &&
                      editing.id === s.id ? (
                        <Input
                          key={s.id}
                          autoFocus
                          className="h-7 w-40 text-sm"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <Badge
                          key={s.id}
                          variant="outline"
                          className="gap-1 pr-1"
                        >
                          {s.name}
                          {s.kind === "income" && (
                            <span className="text-green-600">↑</span>
                          )}
                          <button
                            onClick={() =>
                              startEdit("subcategories", s.id, s.name)
                            }
                            className="ml-1 rounded-full p-0.5 hover:bg-muted"
                            aria-label={`Renombrar ${s.name}`}
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            onClick={() => removeSub(s.id)}
                            className="rounded-full p-0.5 hover:bg-muted"
                            aria-label={`Eliminar ${s.name}`}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </Badge>
                      )
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nueva subcategoría"
                      className="h-8 text-sm"
                      value={subName[c.id] ?? ""}
                      onChange={(e) =>
                        setSubName((p) => ({ ...p, [c.id]: e.target.value }))
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        setSubKind((p) => ({
                          ...p,
                          [c.id]:
                            (p[c.id] ?? "expense") === "expense"
                              ? "income"
                              : "expense",
                        }))
                      }
                    >
                      {(subKind[c.id] ?? "expense") === "expense"
                        ? "Gasto"
                        : "Ingreso"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => addSub(c.id)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex gap-2 pt-2">
          <Input
            placeholder="Nueva categoría"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="outline" onClick={addCategory}>
            <Plus className="size-4" />
            Añadir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
