"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function CategoriesSection({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");

  async function addCategory() {
    if (!name.trim()) return;
    const { error } = await createClient()
      .from("categories")
      .insert({ name: name.trim(), kind });
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

  function list(k: "expense" | "income") {
    return (
      <div className="flex flex-wrap gap-2">
        {categories
          .filter((c) => c.kind === k)
          .map((c) => (
            <Badge key={c.id} variant="outline" className="gap-1 pr-1">
              {c.name}
              <button
                onClick={() => removeCategory(c.id)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                aria-label={`Eliminar ${c.name}`}
              >
                <Trash2 className="size-3" />
              </button>
            </Badge>
          ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorías</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs
          value={kind}
          onValueChange={(v) => setKind(v as "expense" | "income")}
        >
          <TabsList className="mb-3 w-full">
            <TabsTrigger value="expense" className="flex-1">
              Gastos
            </TabsTrigger>
            <TabsTrigger value="income" className="flex-1">
              Ingresos
            </TabsTrigger>
          </TabsList>
          <TabsContent value="expense">{list("expense")}</TabsContent>
          <TabsContent value="income">{list("income")}</TabsContent>
        </Tabs>
        <div className="flex gap-2">
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
