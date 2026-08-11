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
  normalizeForMatch,
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
  // Solo miembros de una familia (la 2ª pasada del parse invoca a la IA)
  const { data: me } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return new Response("Sin familia", { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return Response.json(
      { error: "El archivo supera los 5 MB. ¿Seguro que es un extracto?" },
      { status: 400 }
    );
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
  // Todo lo ya guardado en el rango de fechas del extracto: sirve para el
  // duplicado exacto (misma huella) y para el blando (misma fecha+importe+tipo
  // con otro texto, p.ej. el mismo recibo en el Excel corto y el largo).
  const minDate = movements.reduce((a, m) => (m.date < a ? m.date : a), "9999");
  const maxDate = movements.reduce((a, m) => (m.date > a ? m.date : a), "0000");
  const [rulesQ, rangeQ, categoriesQ, subcategoriesQ, fixedTxQ, recIncQ] =
    await Promise.all([
      supabase
        .from("category_rules")
        .select("pattern, category_id, subcategory_id"),
      supabase
        .from("transactions")
        .select("date, amount, type, dedup_hash")
        .gte("date", minDate)
        .lte("date", maxDate),
      supabase.from("categories").select("id, name, kind"),
      supabase.from("subcategories").select("id, category_id, name, kind"),
      // Subcats donde ya hay recibos marcados como fijos: pista del checkbox.
      // Ordenado por fecha desc: si el límite recorta, recorta lo antiguo.
      supabase
        .from("transactions")
        .select("subcategory_id")
        .eq("is_fixed", true)
        .not("subcategory_id", "is", null)
        .order("date", { ascending: false })
        .limit(1000),
      // Ingresos recurrentes activos en el rango: para vincular las nóminas
      // del extracto (vinculado = sustituye al previsto, no cuenta doble)
      supabase
        .from("recurring_incomes")
        .select("id, name, amount")
        .lte("starts_on", maxDate)
        .or(`ends_on.is.null,ends_on.gte.${minDate}`),
    ]);

  const rules = (rulesQ.data ?? []).sort(
    (a, b) => b.pattern.length - a.pattern.length
  );
  const stored = rangeQ.data ?? [];
  const existing = new Set(stored.map((d) => d.dedup_hash).filter(Boolean));
  // Ocurrencias por fecha+importe+tipo, para el duplicado blando. Cada
  // coincidencia consume una: si hay 3 cafés de 2€ guardados y el extracto
  // trae 4, solo 3 se marcan como posibles duplicados.
  const softKey = (date: string, amount: number, type: string) =>
    `${date}|${amount.toFixed(2)}|${type}`;
  const softCount = new Map<string, number>();
  for (const t of stored) {
    const k = softKey(t.date, Number(t.amount), t.type);
    softCount.set(k, (softCount.get(k) ?? 0) + 1);
  }
  // Los duplicados exactos consumen primero su ocurrencia
  const exactDup = movements.map((m, i) => {
    const isDup = existing.has(hashes[i]);
    if (isDup) {
      const k = softKey(m.date, m.amount, m.type);
      softCount.set(k, (softCount.get(k) ?? 0) - 1);
    }
    return isDup;
  });
  const categories = categoriesQ.data ?? [];
  const subcategories = subcategoriesQ.data ?? [];
  const recurringIncomes = recIncQ.data ?? [];
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  // Subcats con recibos previstos en el histórico: pista para el checkbox
  const fixedSubIds = new Set(
    (fixedTxQ.data ?? []).map((t) => t.subcategory_id).filter(Boolean)
  );

  const rows = movements.map((m, i) => {
    // Misma normalización que rulePattern: si no, los patrones aprendidos con
    // acentos/puntuación/dígitos en el concepto original no coinciden nunca
    const normDesc = normalizeForMatch(m.description);
    const rule = rules.find((r) => normDesc.includes(r.pattern));
    const sub = rule?.subcategory_id
      ? subById.get(rule.subcategory_id)
      : undefined;
    let duplicate = exactDup[i];
    if (!duplicate) {
      // Duplicado blando: ya hay un movimiento guardado ese día con el mismo
      // importe y tipo (con otro texto). Se desmarca y el usuario decide.
      const k = softKey(m.date, m.amount, m.type);
      const left = softCount.get(k) ?? 0;
      if (left > 0) {
        duplicate = true;
        softCount.set(k, left - 1);
      }
    }
    // Nómina/alquiler del extracto: si el importe clava el de un ingreso
    // recurrente activo, se sugiere el vínculo (el usuario puede cambiarlo)
    const suggestedRec =
      m.type === "income"
        ? recurringIncomes.find(
            (r) => Math.abs(Number(r.amount) - m.amount) < 0.005
          )
        : undefined;
    return {
      ...m,
      dedup_hash: hashes[i],
      exact_duplicate: exactDup[i],
      category_id: sub?.category_id ?? rule?.category_id ?? null,
      subcategory_id: rule?.subcategory_id ?? null,
      recurring_income_id: suggestedRec?.id ?? null,
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
    recurringIncomes,
    fileName: file.name,
  });
}
