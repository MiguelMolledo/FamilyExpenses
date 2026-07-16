"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Pet } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PetsSection({ pets }: { pets: Pet[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pcts, setPcts] = useState<Record<string, string>>(
    Object.fromEntries(pets.map((p) => [p.id, String(p.default_split_pct)]))
  );

  const totalPct = pets.reduce(
    (s, p) => s + (Number(pcts[p.id] ?? p.default_split_pct) || 0),
    0
  );

  async function addPet() {
    if (!name.trim()) return;
    const { error } = await createClient()
      .from("pets")
      .insert({ name: name.trim() });
    if (error) return void toast.error("No se pudo añadir");
    setName("");
    router.refresh();
  }

  async function removePet(id: string) {
    const { error } = await createClient().from("pets").delete().eq("id", id);
    if (error) return void toast.error("No se pudo eliminar");
    router.refresh();
  }

  async function savePct(id: string) {
    const { error } = await createClient()
      .from("pets")
      .update({ default_split_pct: Number(pcts[id]) || 0 })
      .eq("id", id);
    if (error) return void toast.error("No se pudo guardar");
    toast.success("Reparto guardado");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mascotas</CardTitle>
        <CardDescription>
          % por defecto del reparto de gastos compartidos (comida, veterinario…)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pets.map((pet) => (
          <div key={pet.id} className="flex items-center gap-2">
            <span className="flex-1 font-medium">{pet.name}</span>
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              className="w-20"
              value={pcts[pet.id] ?? ""}
              onChange={(e) =>
                setPcts((prev) => ({ ...prev, [pet.id]: e.target.value }))
              }
              onBlur={() => savePct(pet.id)}
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removePet(pet.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {pets.length > 0 && totalPct !== 100 && (
          <p className="text-sm text-amber-600">
            Los porcentajes suman {totalPct}% (deberían sumar 100%)
          </p>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Nombre de la mascota"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="outline" onClick={addPet}>
            <Plus className="size-4" />
            Añadir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
