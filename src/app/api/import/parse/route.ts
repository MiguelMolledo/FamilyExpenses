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
      subcategory: z.string().nullable(),
      fijo: z.boolean(),
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
  const [rulesQ, dupQ, categoriesQ, subcategoriesQ, fijosQ] = await Promise.all([
    supabase
      .from("category_rules")
      .select("pattern, category_id, subcategory_id"),
    supabase.from("transactions").select("dedup_hash").in("dedup_hash", hashes),
    supabase.from("categories").select("id, name, kind"),
    supabase.from("subcategories").select("id, category_id, name, kind"),
    supabase
      .from("recurring_expenses")
      .select("id, name, category_id, subcategory_id")
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
  ]);

  const rules = (rulesQ.data ?? []).sort(
    (a, b) => b.pattern.length - a.pattern.length
  );
  const existing = new Set((dupQ.data ?? []).map((d) => d.dedup_hash));
  const categories = categoriesQ.data ?? [];
  const subcategories = subcategoriesQ.data ?? [];
  const fijos = fijosQ.data ?? [];
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  // Subcats con algún fijo dado de alta: pista para sugerir el checkbox
  const fixedSubIds = new Set(
    fijos.map((f) => f.subcategory_id).filter(Boolean)
  );

  const rows = movements.map((m, i) => {
    const normDesc = m.description.toLowerCase();
    const rule = rules.find((r) => normDesc.includes(r.pattern));
    const sub = rule?.subcategory_id
      ? subById.get(rule.subcategory_id)
      : undefined;
    const duplicate = existing.has(hashes[i]);
    return {
      ...m,
      dedup_hash: hashes[i],
      category_id: sub?.category_id ?? rule?.category_id ?? null,
      subcategory_id: rule?.subcategory_id ?? null,
      is_fixed:
        m.type === "expense" &&
        !!rule?.subcategory_id &&
        fixedSubIds.has(rule.subcategory_id),
      duplicate,
      checked: !duplicate,
      ai: false,
    };
  });

  // Segunda pasada, con IA: solo los conceptos que las reglas aprendidas no
  // conocen. Las reglas siempre mandan; la IA solo rellena huecos, y lo que
  // el usuario confirme al importar se convierte en regla (la IA se usa cada
  // vez menos). Si el modelo falla, el import sigue sin sugerencias.
  const pending = [
    ...new Map(
      rows
        .filter((r) => !r.subcategory_id)
        .map((r) => [r.description, { description: r.description, type: r.type }])
    ).values(),
  ];
  if (pending.length > 0 && process.env.OPENROUTER_API_KEY) {
    try {
      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });
      const catById = new Map(categories.map((c) => [c.id, c.name]));
      const taxonomy = subcategories
        .map(
          (s) =>
            `${catById.get(s.category_id)} > ${s.name} (${
              s.kind === "expense" ? "gasto" : "ingreso"
            })`
        )
        .join("; ");
      const { object } = await generateObject({
        model: openrouter(process.env.OPENROUTER_MODEL ?? "openai/gpt-5.6-luna"),
        schema: SuggestionSchema,
        abortSignal: AbortSignal.timeout(30_000),
        prompt: [
          "Eres el clasificador de un app familiar de gastos en España.",
          'Para cada concepto bancario, sugiere "category" y "subcategory" eligiendo un par EXACTO de la taxonomía (respeta el tipo: gasto o ingreso). Usa null si no hay un candidato claro; no inventes nombres.',
          '"fijo" es true solo si claramente es un recibo recurrente planificado (hipoteca, suscripción, seguro, cuota…), false para gasto variable (compras, restaurantes, gasolina…).',
          `Taxonomía (Categoría > Subcategoría (tipo)): ${taxonomy}`,
          `Recibos fijos dados de alta (para reconocerlos): ${fijos
            .map((f) => f.name)
            .join(", ")}`,
          `Conceptos a clasificar (tipo entre paréntesis): ${pending
            .map((p) => `"${p.description}" (${p.type})`)
            .join("; ")}`,
        ].join("\n\n"),
      });
      const byDesc = new Map(
        object.items.map((s) => [s.description.toLowerCase(), s])
      );
      const catByName = new Map(
        categories.map((c) => [c.name.toLowerCase(), c])
      );
      for (const row of rows) {
        if (row.subcategory_id) continue;
        const s = byDesc.get(row.description.toLowerCase());
        if (!s) continue;
        const cat = s.category ? catByName.get(s.category.toLowerCase()) : null;
        const sub =
          cat && s.subcategory
            ? subcategories.find(
                (x) =>
                  x.category_id === cat.id &&
                  x.name.toLowerCase() === s.subcategory!.toLowerCase() &&
                  x.kind === row.type
              )
            : null;
        if (sub) {
          row.category_id = cat!.id;
          row.subcategory_id = sub.id;
          row.is_fixed = row.type === "expense" && s.fijo;
          row.ai = true;
        } else if (cat && !row.category_id) {
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
    categories,
    subcategories,
    fileName: file.name,
  });
}
