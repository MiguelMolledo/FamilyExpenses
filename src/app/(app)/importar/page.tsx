"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { eur, type Category } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Row = {
  date: string;
  description: string;
  amount: number;
  type: "expense" | "income";
  category_id: string | null;
  recurring_expense_id: string | null;
  dedup_hash: string;
  duplicate: boolean;
  checked: boolean;
};

type Fijo = { id: string; name: string };

export default function ImportarPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fijos, setFijos] = useState<Fijo[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);

  async function onFile(file: File) {
    setParsing(true);
    setRows([]);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/import/parse", { method: "POST", body: form });
    setParsing(false);
    if (!res.ok) return void toast.error("No se pudo procesar el archivo");
    const data = await res.json();
    if (data.warning) toast.warning(data.warning);
    setRows(data.rows ?? []);
    setCategories(data.categories ?? []);
    setFijos(data.fijos ?? []);
    setFileName(data.fileName ?? file.name);
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const selected = rows.filter((r) => r.checked);

  async function commit() {
    setCommitting(true);
    const res = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName,
        rows: selected.map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          type: r.type,
          category_id: r.category_id,
          recurring_expense_id: r.recurring_expense_id,
          dedup_hash: r.dedup_hash,
        })),
      }),
    });
    setCommitting(false);
    if (!res.ok) return void toast.error("No se pudo importar");
    const data = await res.json();
    toast.success(
      `Importados ${data.imported} movimientos` +
        (data.skipped > 0 ? ` (${data.skipped} saltados)` : "")
    );
    setRows([]);
    router.refresh();
  }

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const incomeCategories = categories.filter((c) => c.kind === "income");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Importar extracto</h1>

      <Card>
        <CardContent className="pt-6">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center">
            {parsing ? (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            ) : (
              <FileUp className="size-8 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {parsing
                ? "Analizando extracto…"
                : "Sube el PDF o Excel de CaixaBank"}
            </span>
            <span className="text-xs text-muted-foreground">
              Se procesa en tu servidor. Los movimientos no pasan por ninguna IA.
            </span>
            <input
              type="file"
              accept="application/pdf,.xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selected.length} de {rows.length} seleccionados
            </p>
            <Button
              onClick={commit}
              disabled={committing || selected.length === 0}
            >
              {committing ? "Importando…" : `Importar ${selected.length}`}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <Card
                key={row.dedup_hash + i}
                className={cn(!row.checked && "opacity-60")}
              >
                <CardContent className="flex flex-col gap-2 py-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={row.checked}
                      onCheckedChange={(c) =>
                        update(i, { checked: c === true })
                      }
                    />
                    <Input
                      value={row.description}
                      onChange={(e) =>
                        update(i, { description: e.target.value })
                      }
                      className="h-8 flex-1 text-sm"
                    />
                    <span
                      className={cn(
                        "shrink-0 font-semibold",
                        row.type === "income"
                          ? "text-green-600"
                          : "text-red-600"
                      )}
                    >
                      {row.type === "income" ? "+" : "−"}
                      {eur(row.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pl-7">
                    <Input
                      type="date"
                      value={row.date}
                      onChange={(e) => update(i, { date: e.target.value })}
                      className="h-8 w-36 text-xs"
                    />
                    <Select
                      value={row.category_id ?? ""}
                      items={Object.fromEntries(
                        (row.type === "expense"
                          ? expenseCategories
                          : incomeCategories
                        ).map((c) => [c.id, c.name])
                      )}
                      onValueChange={(v) =>
                        update(i, { category_id: v || null })
                      }
                    >
                      <SelectTrigger className="h-8 flex-1 text-xs">
                        <SelectValue placeholder="Sin categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {(row.type === "expense"
                          ? expenseCategories
                          : incomeCategories
                        ).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {row.duplicate && (
                      <Badge
                        variant="destructive"
                        className="shrink-0 text-[10px]"
                      >
                        posible duplicado
                      </Badge>
                    )}
                  </div>
                  {row.type === "expense" && fijos.length > 0 && (
                    <div className="flex items-center gap-2 pl-7">
                      <Select
                        value={row.recurring_expense_id ?? ""}
                        items={Object.fromEntries(
                          fijos.map((f) => [f.id, f.name])
                        )}
                        onValueChange={(v) =>
                          update(i, { recurring_expense_id: v || null })
                        }
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue placeholder="Sin gasto fijo (cuenta como extra)" />
                        </SelectTrigger>
                        <SelectContent>
                          {fijos.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
