import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  streamText,
  tool,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCategoryBudgets, getMonthBudget, monthEnd } from "@/lib/budget";
import { currentMonthStart, todayMadrid } from "@/lib/types";

export const maxDuration = 60;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const { messages }: { messages: UIMessage[] } = await req.json();
  const today = todayMadrid();
  const month = currentMonthStart();

  // Contexto de la familia para que el modelo resuelva nombres sin adivinar
  const [categoriesQ, subcategoriesQ, recurringIncQ, petsQ, profilesQ] =
    await Promise.all([
      supabase.from("categories").select("id, name, kind"),
      supabase.from("subcategories").select("id, category_id, name, kind"),
      supabase
        .from("recurring_incomes")
        .select("id, name, amount")
        .lte("starts_on", monthEnd(month))
        .or(`ends_on.is.null,ends_on.gte.${month}`),
      supabase.from("pets").select("id, name, default_split_pct"),
      supabase.from("profiles").select("user_id, display_name"),
    ]);

  const categories = categoriesQ.data ?? [];
  const subcategories = subcategoriesQ.data ?? [];
  const recurringIncomes = recurringIncQ.data ?? [];
  const pets = petsQ.data ?? [];
  const profiles = profilesQ.data ?? [];

  const findCategory = (name?: string) =>
    name
      ? categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
      : undefined;
  // Subcategoría dentro de la categoría dada (o en cualquiera si no se indica)
  const findSubcategory = (subName?: string, categoryId?: string) =>
    subName
      ? subcategories.find(
          (s) =>
            s.name.toLowerCase() === subName.toLowerCase() &&
            (!categoryId || s.category_id === categoryId)
        )
      : undefined;
  const system = `Eres el asistente de FamilyExpenses, la app de gastos de la familia. Responde SIEMPRE en español, breve y al grano (se usa desde el móvil).

Hoy es ${today}. El mes actual es ${month.slice(0, 7)}.

Datos de la familia:
- Taxonomía (los movimientos se asignan a Categoría › Subcategoría; el tipo va entre paréntesis): ${categories
    .map((c) => {
      const subs = subcategories.filter((s) => s.category_id === c.id);
      return `${c.name}: ${subs
        .map((s) => `${s.name}${s.kind === "income" ? " (ingreso)" : ""}`)
        .join(", ")}`;
    })
    .join(" | ") || "ninguna"}
- Ingresos recurrentes: ${recurringIncomes.map((r) => `${r.name} (${r.amount}€/mes)`).join(", ") || "ninguno"}
- Mascotas: ${pets.map((p) => `${p.name} (${p.default_split_pct}%)`).join(", ") || "ninguna"}
- Miembros: ${profiles.map((p) => p.display_name).join(", ")}

Modelo de presupuesto:
- El presupuesto vive en la categoría; TODO gasto de la categoría descuenta de él, sea fijo o variable.
- Solo cuenta el gasto real: nada se descuenta por adelantado. El disponible del mes es ingresos − gasto real − objetivo de ahorro + arrastre.
- is_fixed=true solo marca que es un recibo recurrente planificado (hipoteca, suscripción, seguro…); no cambia el presupuesto. Una cena o una compra puntual es is_fixed=false aunque sea de una categoría con recibos.
- Las categorías con sobrante "acumula" arrastran lo no gastado del año (así los recibos anuales como IBI o seguros caben en su mes); consulta get_category_budgets para saldos.
- Los traspasos entre cuentas propias van en la categoría Traspaso y no cuentan como gasto ni ingreso.

Reglas:
- Usa las tools para leer o modificar datos. No inventes cifras.
- Al añadir un movimiento, elige categoría Y subcategoría de la taxonomía (respeta el tipo). Marca is_fixed solo si es un recibo previsto.
- Si el gasto es de las mascotas, usa pet_split=true para repartirlo con sus porcentajes.
- Tras ejecutar una tool, confirma en una frase qué has hecho, con el importe.`;

  const result = streamText({
    model: openrouter.chat(
      process.env.OPENROUTER_MODEL ?? "anthropic/claude-haiku-4.5"
    ),
    system,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(8),
    tools: {
      add_expense: tool({
        description:
          "Añade un gasto real con categoría y subcategoría. is_fixed=true solo si es un recibo recurrente planificado. Si es de mascotas, pet_split=true.",
        inputSchema: z.object({
          amount: z.number().positive(),
          description: z.string().default(""),
          date: z.string().describe("YYYY-MM-DD, por defecto hoy").default(today),
          category_name: z.string().optional(),
          subcategory_name: z.string().optional(),
          is_fixed: z.boolean().default(false),
          pet_split: z.boolean().default(false),
        }),
        execute: async (input) => {
          const category = findCategory(input.category_name);
          const sub = findSubcategory(input.subcategory_name, category?.id);
          const { data, error } = await supabase
            .from("transactions")
            .insert({
              amount: input.amount,
              description: input.description,
              date: input.date,
              type: "expense",
              category_id: category?.id ?? sub?.category_id ?? null,
              subcategory_id: sub?.id ?? null,
              is_fixed: input.is_fixed,
            })
            .select("id")
            .single();
          if (error) return { error: error.message };
          if (input.pet_split && pets.length > 0) {
            // Reparto en céntimos; si los porcentajes suman 100, la última
            // mascota se lleva el resto para que la suma cuadre con el total
            // (10,01 € al 50/50 no puede ser 5,01 + 5,01).
            const totalPct = pets.reduce(
              (s, p) => s + Number(p.default_split_pct),
              0
            );
            const totalCents = Math.round(input.amount * 100);
            let remaining = totalCents;
            const splits = pets
              .map((p, i) => {
                const cents =
                  i === pets.length - 1 && totalPct === 100
                    ? remaining
                    : Math.round(
                        (totalCents * Number(p.default_split_pct)) / 100
                      );
                remaining -= cents;
                return {
                  transaction_id: data.id,
                  pet_id: p.id,
                  amount: cents / 100,
                };
              })
              .filter((r) => r.amount > 0);
            await supabase.from("transaction_pet_splits").insert(splits);
          }
          return { ok: true, id: data.id };
        },
      }),

      add_income: tool({
        description:
          "Añade un ingreso. Si NO corresponde a un ingreso recurrente, cuenta como extraordinario.",
        inputSchema: z.object({
          amount: z.number().positive(),
          description: z.string().default(""),
          date: z.string().default(today),
          member_name: z.string().optional(),
          recurring_income_name: z.string().optional(),
          category_name: z
            .string()
            .optional()
            .describe("p.ej. Trabajo, Piso o Traspaso"),
          subcategory_name: z.string().optional().describe("p.ej. Ingresos"),
        }),
        execute: async (input) => {
          const profile = input.member_name
            ? profiles.find(
                (p) =>
                  p.display_name.toLowerCase() ===
                  input.member_name!.toLowerCase()
              )
            : undefined;
          const recurring = input.recurring_income_name
            ? recurringIncomes.find(
                (r) =>
                  r.name.toLowerCase() ===
                  input.recurring_income_name!.toLowerCase()
              )
            : undefined;
          const category = findCategory(input.category_name);
          const sub = findSubcategory(input.subcategory_name, category?.id);
          const { error } = await supabase.from("transactions").insert({
            amount: input.amount,
            description: input.description,
            date: input.date,
            type: "income",
            category_id: category?.id ?? sub?.category_id ?? null,
            subcategory_id: sub?.id ?? null,
            recurring_income_id: recurring?.id ?? null,
            profile_id: profile?.user_id ?? null,
            is_extraordinary: !recurring,
          });
          return error ? { error: error.message } : { ok: true };
        },
      }),

      add_savings_movement: tool({
        description:
          "Registra un movimiento en la hucha de ahorro: aportación (monthly/extra), retirada (withdrawal, importe positivo) o intereses (interest).",
        inputSchema: z.object({
          amount: z.number().positive(),
          kind: z.enum(["monthly", "extra", "withdrawal", "interest"]),
          note: z.string().optional(),
          date: z.string().default(today),
        }),
        execute: async (input) => {
          const { data: account } = await supabase
            .from("savings_accounts")
            .select("id")
            .limit(1)
            .single();
          if (!account) return { error: "No hay hucha creada" };
          const { error } = await supabase.from("savings_movements").insert({
            account_id: account.id,
            amount:
              input.kind === "withdrawal"
                ? -Math.abs(input.amount)
                : input.amount,
            kind: input.kind,
            note: input.note ?? null,
            date: input.date,
          });
          return error ? { error: error.message } : { ok: true };
        },
      }),

      get_month_summary: tool({
        description:
          "Resumen de un mes: ingresos, presupuesto, gasto real, variables y disponible.",
        inputSchema: z.object({
          month: z
            .string()
            .describe("YYYY-MM-01, por defecto el mes actual")
            .default(month),
        }),
        execute: async (input) => {
          const b = await getMonthBudget(supabase, input.month);
          return {
            month: b.month,
            ingresos_previstos: b.expectedIncome,
            ingresos_reales: b.realIncome,
            presupuesto: b.budgeted,
            objetivo_ahorro: b.savingsTarget,
            gasto_real: b.realExpenses,
            gastos_variables: b.extraExpenses,
            disponible: b.available,
            cerrado: b.closed,
          };
        },
      }),

      get_category_budgets: tool({
        description:
          "Presupuesto por categoría del mes: presupuestado, gastado (y cuánto en fijos), disponible y saldo acumulado del año; incluye la capacidad de reacción (gasto en categorías recortables).",
        inputSchema: z.object({
          month: z
            .string()
            .describe("YYYY-MM-01, por defecto el mes actual")
            .default(month),
        }),
        execute: async (input) => {
          const b = await getCategoryBudgets(supabase, input.month);
          return {
            categorias: b.rows.map((r) => ({
              categoria: r.category.name,
              presupuesto: r.budget,
              gastado: r.spent,
              en_fijos: r.fixedSpent,
              disponible: r.available,
              acumulado_del_año: r.accumulated,
              recortable: r.category.is_flexible,
              sobrante: r.category.rollover,
            })),
            gasto_total: b.totalSpent,
            gasto_recortable: b.flexibleSpent,
          };
        },
      }),

      query_transactions: tool({
        description:
          "Busca movimientos con filtros: rango de fechas, categoría, texto o tipo.",
        inputSchema: z.object({
          from: z.string().describe("YYYY-MM-DD").default(month),
          to: z.string().describe("YYYY-MM-DD").default(monthEnd(month)),
          category_name: z.string().optional(),
          subcategory_name: z.string().optional(),
          only_fixed: z
            .boolean()
            .optional()
            .describe("true = solo recibos fijos, false = solo variables"),
          text: z.string().optional(),
          type: z.enum(["expense", "income"]).optional(),
        }),
        execute: async (input) => {
          const category = findCategory(input.category_name);
          const sub = findSubcategory(input.subcategory_name, category?.id);
          const buildQuery = (select: string) => {
            let q = supabase
              .from("transactions")
              .select(select)
              .gte("date", input.from)
              .lte("date", input.to)
              .order("date", { ascending: false });
            if (category) q = q.eq("category_id", category.id);
            if (sub) q = q.eq("subcategory_id", sub.id);
            if (input.only_fixed !== undefined)
              q = q.eq("is_fixed", input.only_fixed);
            if (input.type) q = q.eq("type", input.type);
            if (input.text) q = q.ilike("description", `%${input.text}%`);
            return q;
          };

          const { data, error } = await buildQuery(
            "date, amount, type, description, category_id, subcategory_id, is_fixed"
          ).limit(100);
          if (error) return { error: error.message };
          const rows = (data ?? []) as unknown as {
            date: string;
            amount: number;
            type: string;
            description: string;
            category_id: string | null;
            subcategory_id: string | null;
            is_fixed: boolean;
          }[];

          // El total va sobre TODO lo que cumple el filtro, no sobre la lista
          // truncada a 100: si no, "cuánto llevo este año" mentiría en cuanto
          // haya más movimientos que el límite. Paginado (PostgREST corta a
          // 1000 filas por respuesta).
          let total = 0;
          let summed = 0;
          let totalTruncated = false;
          for (let page = 0; page < 10; page++) {
            const { data: amounts, error: sumError } = await buildQuery(
              "amount"
            ).range(page * 1000, page * 1000 + 999);
            if (sumError) return { error: sumError.message };
            const batch = (amounts ?? []) as unknown as { amount: number }[];
            total += batch.reduce((s, t) => s + Number(t.amount), 0);
            summed += batch.length;
            if (batch.length < 1000) break;
            if (page === 9) totalTruncated = true;
          }

          const catName = new Map(categories.map((c) => [c.id, c.name]));
          const subName = new Map(subcategories.map((s) => [s.id, s.name]));
          return {
            total,
            movimientos_encontrados: summed,
            lista_truncada_a_100: rows.length === 100,
            ...(totalTruncated ? { aviso: "total parcial (>10000 movs)" } : {}),
            movimientos: rows.map((t) => ({
              fecha: t.date,
              importe: Number(t.amount),
              tipo: t.type,
              descripcion: t.description,
              categoria: catName.get(t.category_id ?? "") ?? null,
              subcategoria: subName.get(t.subcategory_id ?? "") ?? null,
              fijo: t.is_fixed,
            })),
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
