import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eur, type Pet } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PawPrint, Settings } from "lucide-react";

export default async function MascotasPage() {
  const supabase = await createClient();
  const year = new Date().getFullYear();

  const [petsQ, splitsQ] = await Promise.all([
    supabase.from("pets").select("*").order("created_at"),
    supabase
      .from("transaction_pet_splits")
      .select("pet_id, amount, transactions!inner(date)")
      .gte("transactions.date", `${year}-01-01`)
      .lte("transactions.date", `${year}-12-31`),
  ]);

  const pets = (petsQ.data ?? []) as Pet[];
  const splits = splitsQ.data ?? [];

  const totalByPet = new Map<string, number>();
  const monthsWithSpend = new Set<string>();
  for (const s of splits) {
    totalByPet.set(s.pet_id, (totalByPet.get(s.pet_id) ?? 0) + Number(s.amount));
    const tx = s.transactions as unknown as { date: string };
    monthsWithSpend.add(tx.date.slice(0, 7));
  }
  const totalYear = [...totalByPet.values()].reduce((a, b) => a + b, 0);
  // Media mensual sobre los meses transcurridos del año (las compras de
  // mascotas son irregulares: un mes 400 €, dos meses nada)
  const elapsedMonths = new Date().getMonth() + 1;
  const maxTotal = Math.max(1, ...totalByPet.values());

  if (pets.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Mascotas</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <PawPrint className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aún no hay mascotas. Añádelas en Ajustes con su % de reparto.
            </p>
            <Button variant="outline" render={<Link href="/ajustes" />}>
              <Settings className="size-4" />
              Ir a Ajustes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Mascotas</h1>

      {/* Escritorio: totales a la izquierda, coste por animal a la derecha */}
      <div className="grid gap-4 @3xl:grid-cols-[360px_minmax(0,1fr)] @3xl:items-start @3xl:gap-6">
        <Card>
          <CardContent className="grid grid-cols-2 gap-2 pt-6 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Total {year}</p>
              <p className="text-2xl font-bold">{eur(totalYear)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Media mensual</p>
              <p className="text-2xl font-bold">
                {eur(totalYear / elapsedMonths)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coste por animal en {year}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pets.map((pet) => {
              const total = totalByPet.get(pet.id) ?? 0;
              return (
                <div key={pet.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      <PawPrint className="size-4 text-muted-foreground" />
                      {pet.name}
                    </span>
                    <span className="font-semibold">{eur(total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-orange-400"
                      style={{ width: `${(total / maxTotal) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {eur(total / elapsedMonths)}/mes de media · reparto por
                    defecto {pet.default_split_pct}%
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Los importes salen de los gastos con reparto entre mascotas. Al añadir
        un gasto en Movimientos, marca «Repartir entre las mascotas».
      </p>
    </div>
  );
}
