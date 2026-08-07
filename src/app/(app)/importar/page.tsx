"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { eur, type Category, type Subcategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CategorySubcategorySelect } from "@/components/category-select";
import { cn } from "@/lib/utils";

type Row = {
  date: string;
  description: string;
  amount: number;
  type: "expense" | "income";
  category_id: string | null;
  subcategory_id: string | null;
  is_fixed: boolean;
  dedup_hash: string;
  duplicate: boolean;
  /** misma huella exacta; si no, coincide fecha+importe con otro texto */
  exact_duplicate?: boolean;
  checked: boolean;
  ai?: boolean;
};

type Draft = {
  rows: Row[];
  categories: Category[];
  subcategories: Subcategory[];
  fileName: string;
};

// El borrador sobrevive a la navegación: se guarda en localStorage y se
// restaura al volver. Se limpia al importar o al cancelar.
const DRAFT_KEY = "import-draft";

export default function ImportarPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Draft;
        if (draft.rows?.length > 0) {
          setRows(draft.rows);
          setCategories(draft.categories ?? []);
          setSubcategories(draft.subcategories ?? []);
          setFileName(draft.fileName ?? "");
        }
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (rows.length === 0) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ rows, categories, subcategories, fileName } satisfies Draft)
    );
  }, [restored, rows, categories, subcategories, fileName]);

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
    setSubcategories(data.subcategories ?? []);
    setFileName(data.fileName ?? file.name);
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function cancel() {
    setRows([]);
    localStorage.removeItem(DRAFT_KEY);
    toast.info("Import cancelado, no se ha guardado nada");
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
          subcategory_id: r.subcategory_id,
          is_fixed: r.is_fixed,
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
    localStorage.removeItem(DRAFT_KEY);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Importar extracto</h1>

      {rows.length === 0 && (
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
                Se procesa en tu servidor. Solo los conceptos sin regla
                aprendida se envían a la IA para sugerir categoría y
                subcategoría (nunca importes ni fechas).
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
      )}

      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {fileName && <span className="font-medium">{fileName}</span>} ·{" "}
              {selected.length} de {rows.length} seleccionados
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={cancel} disabled={committing}>
                Cancelar
              </Button>
              <Button
                onClick={commit}
                disabled={committing || selected.length === 0}
              >
                {committing ? "Importando…" : `Importar ${selected.length}`}
              </Button>
            </div>
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
                    <div className="flex-1">
                      <CategorySubcategorySelect
                        categories={categories}
                        subcategories={subcategories}
                        kind={row.type}
                        categoryId={row.category_id}
                        subcategoryId={row.subcategory_id}
                        onChange={(cat, sub) =>
                          update(i, { category_id: cat, subcategory_id: sub })
                        }
                        className="h-8 flex-1 text-xs"
                      />
                    </div>
                    {row.duplicate && (
                      <Badge
                        variant="destructive"
                        className="shrink-0 text-[10px]"
                        title={
                          row.exact_duplicate
                            ? "Ya está importado (misma fecha, importe y concepto)"
                            : "Ya hay un movimiento ese día con el mismo importe (con otro texto)"
                        }
                      >
                        {row.exact_duplicate
                          ? "ya importado"
                          : "posible duplicado"}
                      </Badge>
                    )}
                    {row.ai && (
                      <Sparkles
                        className="size-3.5 shrink-0 text-amber-500"
                        aria-label="Sugerido por IA"
                      />
                    )}
                  </div>
                  {row.type === "expense" && (
                    <label className="flex items-center gap-2 pl-7 text-xs text-muted-foreground">
                      <Checkbox
                        checked={row.is_fixed}
                        onCheckedChange={(c) =>
                          update(i, { is_fixed: c === true })
                        }
                      />
                      Gasto fijo (recibo previsto; si no, cuenta como variable)
                    </label>
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
