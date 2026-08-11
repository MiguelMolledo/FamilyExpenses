import { createClient } from "@/lib/supabase/server";
import { rulePattern } from "@/lib/caixabank";
import { z } from "zod";

const BodySchema = z.object({
  fileName: z.string().default("extracto.pdf"),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string(),
        amount: z.number().positive(),
        type: z.enum(["expense", "income"]),
        category_id: z.string().uuid().nullable(),
        subcategory_id: z.string().uuid().nullable().default(null),
        recurring_income_id: z.string().uuid().nullable().default(null),
        is_fixed: z.boolean().default(false),
        dedup_hash: z.string(),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { data: me } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return new Response("Sin familia", { status: 403 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Datos no válidos" }, { status: 400 });
  }
  const { rows, fileName } = parsed.data;

  // Los UUIDs de categoría vienen del cliente: se validan contra la taxonomía
  // de la familia (el FK no comprueba pertenencia, y un par categoría/subcat
  // incoherente descuadraría los presupuestos y se "aprendería" como regla).
  const [catsQ, subsQ, recIncQ] = await Promise.all([
    supabase.from("categories").select("id"),
    supabase.from("subcategories").select("id, category_id"),
    supabase.from("recurring_incomes").select("id"),
  ]);
  const catIds = new Set((catsQ.data ?? []).map((c) => c.id));
  const subById = new Map((subsQ.data ?? []).map((s) => [s.id, s.category_id]));
  const recIncIds = new Set((recIncQ.data ?? []).map((r) => r.id));
  for (const row of rows) {
    if (row.category_id && !catIds.has(row.category_id)) {
      return Response.json({ error: "Categoría no válida" }, { status: 400 });
    }
    if (row.subcategory_id) {
      const catOfSub = subById.get(row.subcategory_id);
      if (!catOfSub || (row.category_id && catOfSub !== row.category_id)) {
        return Response.json({ error: "Subcategoría no válida" }, { status: 400 });
      }
      row.category_id = catOfSub;
    }
    if (row.type !== "income") row.recurring_income_id = null;
    if (row.recurring_income_id && !recIncIds.has(row.recurring_income_id)) {
      return Response.json(
        { error: "Ingreso recurrente no válido" },
        { status: 400 }
      );
    }
  }

  const source = /\.xlsx?$/i.test(fileName) ? "caixabank_xls" : "caixabank_pdf";
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({ source, file_name: fileName })
    .select("id")
    .single();
  if (batchError) {
    return Response.json({ error: batchError.message }, { status: 500 });
  }

  // Un solo upsert para todo el lote: los duplicados (dedup_hash ya guardado)
  // se ignoran vía ON CONFLICT en vez de un insert por fila.
  const errors: string[] = [];
  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .upsert(
      rows.map((row) => ({
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.type,
        category_id: row.category_id,
        subcategory_id: row.subcategory_id,
        recurring_income_id: row.recurring_income_id,
        is_fixed: row.type === "expense" && row.is_fixed,
        import_batch_id: batch.id,
        dedup_hash: row.dedup_hash,
        // Ingreso sin vincular a un recurrente = extraordinario del mes
        is_extraordinary: row.type === "income" && !row.recurring_income_id,
      })),
      { onConflict: "family_id,dedup_hash", ignoreDuplicates: true }
    )
    .select("id");
  if (insertError) errors.push(insertError.message);
  const imported = inserted?.length ?? 0;

  await supabase
    .from("import_batches")
    .update({ imported_count: imported })
    .eq("id", batch.id);

  // Aprendizaje: reglas concepto→categoría+subcategoría para futuros imports.
  // El patrón va sin dígitos, así "PRES.32635942287" aprende "pres" y matchea
  // el mismo recibo aunque cambie el número.
  const learned = new Map<
    string,
    { category_id: string; subcategory_id: string | null }
  >();
  for (const row of rows) {
    const pattern = rulePattern(row.description);
    if (pattern.length < 4 || !row.category_id) continue;
    learned.set(pattern, {
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
    });
  }
  if (learned.size > 0) {
    await supabase.from("category_rules").upsert(
      [...learned.entries()].map(([pattern, r]) => ({ pattern, ...r })),
      { onConflict: "family_id,pattern" }
    );
  }

  return Response.json({ imported, skipped: rows.length - imported, errors });
}
