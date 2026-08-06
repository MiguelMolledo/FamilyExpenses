import { extractText, getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  parseCaixabankText,
  parseCaixabankSheet,
  dedupHash,
} from "@/lib/caixabank";

const SuggestionSchema = z.object({
  items: z.array(
    z.object({
      description: z.string(),
      category: z.string().nullable(),
      fijo: z.string().nullable(),
    })
  ),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isExcel = /\.xlsx?$/i.test(file.name);
  let movements;
  if (isExcel) {
    const wb = XLSX.read(bytes, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = ws
      ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true })
      : [];
    movements = parseCaixabankSheet(rows);
  } else {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    movements = parseCaixabankText(text);
  }

  if (movements.length === 0) {
    return Response.json({
      rows: [],
      warning: `No se han reconocido movimientos en el ${
        isExcel ? "Excel" : "PDF"
      }. ¿Es un extracto de CaixaBank?`,
    });
  }

  // Reglas de categorización aprendidas + detección de duplicados.
  // Dos movimientos idénticos legítimos en el mismo extracto (misma fecha,
  // importe y concepto) se distinguen con un sufijo de ocurrencia para no
  // chocar con el índice único de dedup.
  const seen = new Map<string, number>();
  const hashes = movements.map((m) => {
    const base = dedupHash(m.date, m.amount, m.description);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
  const today = new Date().toISOString().slice(0, 10);
  const [rulesQ, recurringRulesQ, dupQ, categoriesQ, fijosQ] = await Promise.all([
    supabase.from("category_rules").select("pattern, category_id"),
    supabase.from("recurring_rules").select("pattern, recurring_expense_id"),
    supabase.from("transactions").select("dedup_hash").in("dedup_hash", hashes),
    supabase.from("categories").select("id, name, kind"),
    supabase
      .from("recurring_expenses")
      .select("id, name, category_id")
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .order("name"),
  ]);

  const byLength = (a: { pattern: string }, b: { pattern: string }) =>
    b.pattern.length - a.pattern.length;
  const rules = (rulesQ.data ?? []).sort(byLength);
  const recurringRules = (recurringRulesQ.data ?? []).sort(byLength);
  const fijos = fijosQ.data ?? [];
  const fijoIds = new Set(fijos.map((f) => f.id));
  const existing = new Set((dupQ.data ?? []).map((d) => d.dedup_hash));

  const rows = movements.map((m, i) => {
    const normDesc = m.description.toLowerCase();
    const rule = rules.find((r) => normDesc.includes(r.pattern));
    // Fijo sugerido por regla aprendida; solo si sigue vigente
    const fijoRule =
      m.type === "expense"
        ? recurringRules.find(
            (r) =>
              normDesc.includes(r.pattern) && fijoIds.has(r.recurring_expense_id)
          )
        : undefined;
    const fijo = fijos.find((f) => f.id === fijoRule?.recurring_expense_id);
    const duplicate = existing.has(hashes[i]);
    return {
      ...m,
      dedup_hash: hashes[i],
      // Si el fijo tiene categoría propia, esa manda sobre la regla genérica
      category_id: fijo?.category_id ?? rule?.category_id ?? null,
      recurring_expense_id: fijo?.id ?? null,
      duplicate,
      checked: !duplicate,
      ai: false,
    };
  });

  // Segunda pasada, con IA: solo los conceptos que las reglas aprendidas no
  // conocen. Las reglas siempre mandan; la IA solo rellena huecos, y lo que
  // el usuario confirme al importar se convierte en regla (la IA se usa cada
  // vez menos). Si el modelo falla, el import sigue sin sugerencias.
  const categories = categoriesQ.data ?? [];
  const pending = [
    ...new Map(
      rows
        .filter(
          (r) =>
            !r.category_id || (r.type === "expense" && !r.recurring_expense_id)
        )
        .map((r) => [r.description, { description: r.description, type: r.type }])
    ).values(),
  ];
  if (pending.length > 0 && process.env.OPENROUTER_API_KEY) {
    try {
      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });
      const { object } = await generateObject({
        model: openrouter(process.env.OPENROUTER_MODEL ?? "openai/gpt-5.6-luna"),
        schema: SuggestionSchema,
        abortSignal: AbortSignal.timeout(30_000),
        prompt: [
          "Eres el clasificador de un app familiar de gastos en España.",
          "Para cada concepto bancario, sugiere la categoría y, si claramente corresponde a un recibo recurrente de la lista de gastos fijos, el gasto fijo. Usa null si no hay un candidato claro; no inventes nombres fuera de las listas.",
          `Categorías de gasto: ${categories
            .filter((c) => c.kind === "expense")
            .map((c) => c.name)
            .join(", ")}`,
          `Categorías de ingreso: ${categories
            .filter((c) => c.kind === "income")
            .map((c) => c.name)
            .join(", ")}`,
          `Gastos fijos: ${fijos.map((f) => f.name).join(", ")}`,
          `Conceptos a clasificar (tipo entre paréntesis): ${pending
            .map((p) => `"${p.description}" (${p.type})`)
            .join("; ")}`,
        ].join("\n\n"),
      });
      const catByName = new Map(
        categories.map((c) => [c.name.toLowerCase(), c])
      );
      const fijoByName = new Map(fijos.map((f) => [f.name.toLowerCase(), f]));
      const byDesc = new Map(
        object.items.map((s) => [s.description.toLowerCase(), s])
      );
      for (const row of rows) {
        const s = byDesc.get(row.description.toLowerCase());
        if (!s) continue;
        const cat = s.category ? catByName.get(s.category.toLowerCase()) : null;
        const fijoMatch =
          row.type === "expense" && s.fijo
            ? fijoByName.get(s.fijo.toLowerCase())
            : null;
        if (!row.recurring_expense_id && fijoMatch) {
          row.recurring_expense_id = fijoMatch.id;
          row.category_id = fijoMatch.category_id ?? row.category_id;
          row.ai = true;
        }
        if (!row.category_id && cat && cat.kind === row.type) {
          row.category_id = cat.id;
          row.ai = true;
        }
      }
    } catch {
      // Sin sugerencias de IA: no bloquea el import
    }
  }

  return Response.json({
    rows,
    categories: categoriesQ.data ?? [],
    fijos: fijos.map((f) => ({ id: f.id, name: f.name })),
    fileName: file.name,
  });
}
