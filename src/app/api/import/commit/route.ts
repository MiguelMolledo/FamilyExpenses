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

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Datos no válidos" }, { status: 400 });
  }
  const { rows, fileName } = parsed.data;

  const source = /\.xlsx?$/i.test(fileName) ? "caixabank_xls" : "caixabank_pdf";
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({ source, file_name: fileName })
    .select("id")
    .single();
  if (batchError) {
    return Response.json({ error: batchError.message }, { status: 500 });
  }

  let imported = 0;
  const errors: string[] = [];
  for (const row of rows) {
    const { error } = await supabase.from("transactions").insert({
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      is_fixed: row.type === "expense" && row.is_fixed,
      import_batch_id: batch.id,
      dedup_hash: row.dedup_hash,
      is_extraordinary: false,
    });
    if (error) {
      // 23505 = duplicado (dedup_hash único): lo saltamos sin romper el resto
      if (!error.message.includes("duplicate")) errors.push(error.message);
    } else {
      imported++;
    }
  }

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
