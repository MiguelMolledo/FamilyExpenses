import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { parseCaixabankText, dedupHash } from "@/lib/caixabank";

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
    return Response.json({ error: "Falta el PDF" }, { status: 400 });
  }

  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  const movements = parseCaixabankText(text);

  if (movements.length === 0) {
    return Response.json({
      rows: [],
      warning:
        "No se han reconocido movimientos en el PDF. ¿Es un extracto de CaixaBank?",
    });
  }

  // Reglas de categorización aprendidas + detección de duplicados
  const hashes = movements.map((m) => dedupHash(m.date, m.amount, m.description));
  const [rulesQ, dupQ, categoriesQ] = await Promise.all([
    supabase.from("category_rules").select("pattern, category_id"),
    supabase.from("transactions").select("dedup_hash").in("dedup_hash", hashes),
    supabase.from("categories").select("id, name, kind"),
  ]);

  const rules = (rulesQ.data ?? []).sort(
    (a, b) => b.pattern.length - a.pattern.length
  );
  const existing = new Set((dupQ.data ?? []).map((d) => d.dedup_hash));

  const rows = movements.map((m, i) => {
    const normDesc = m.description.toLowerCase();
    const rule = rules.find((r) => normDesc.includes(r.pattern));
    const duplicate = existing.has(hashes[i]);
    return {
      ...m,
      dedup_hash: hashes[i],
      category_id: rule?.category_id ?? null,
      duplicate,
      checked: !duplicate,
    };
  });

  return Response.json({
    rows,
    categories: categoriesQ.data ?? [],
    fileName: file.name,
  });
}
