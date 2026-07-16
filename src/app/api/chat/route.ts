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
import { getMonthBudget, addMonths, monthEnd } from "@/lib/budget";
import { monthStart } from "@/lib/types";

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
  const today = new Date().toISOString().slice(0, 10);
  const month = monthStart(new Date());

  // Contexto de la familia para que el modelo resuelva nombres sin adivinar
  const [categoriesQ, recurringExpQ, recurringIncQ, petsQ, profilesQ] =
    await Promise.all([
      supabase.from("categories").select("id, name, kind"),
      supabase
        .from("recurring_expenses")
        .select("id, name, amount, period")
        .lte("starts_on", monthEnd(month))
        .or(`ends_on.is.null,ends_on.gte.${month}`),
      supabase
        .from("recurring_incomes")
        .select("id, name, amount")
        .lte("starts_on", monthEnd(month))
        .or(`ends_on.is.null,ends_on.gte.${month}`),
      supabase.from("pets").select("id, name, default_split_pct"),
      supabase.from("profiles").select("user_id, display_name"),
    ]);

  const categories = categoriesQ.data ?? [];
  const recurringExpenses = recurringExpQ.data ?? [];
  const recurringIncomes = recurringIncQ.data ?? [];
  const pets = petsQ.data ?? [];
  const profiles = profilesQ.data ?? [];

  const findCategory = (name?: string) =>
    name
      ? categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
      : undefined;
  const findRecurringExpense = (name?: string) =>
    name
      ? recurringExpenses.find(
          (r) => r.name.toLowerCase() === name.toLowerCase()
        )
      : undefined;

  const system = `Eres el asistente de FamilyExpenses, la app de gastos de la familia. Responde SIEMPRE en español, breve y al grano (se usa desde el móvil).

Hoy es ${today}. El mes actual es ${month.slice(0, 7)}.

Datos de la familia:
- Categorías de gasto: ${categories.filter((c) => c.kind === "expense").map((c) => c.name).join(", ") || "ninguna"}
- Categorías de ingreso: ${categories.filter((c) => c.kind === "income").map((c) => c.name).join(", ") || "ninguna"}
- Gastos fijos activos: ${recurringExpenses.map((r) => `${r.name} (${r.amount}€/${r.period === "annual" ? "año" : "mes"})`).join(", ") || "ninguno"}
- Ingresos recurrentes: ${recurringIncomes.map((r) => `${r.name} (${r.amount}€/mes)`).join(", ") || "ninguno"}
- Mascotas: ${pets.map((p) => `${p.name} (${p.default_split_pct}%)`).join(", ") || "ninguna"}
- Miembros: ${profiles.map((p) => p.display_name).join(", ")}

Reglas:
- Usa las tools para leer o modificar datos. No inventes cifras.
- Al añadir un gasto, elige la categoría más adecuada de la lista. Si el usuario menciona un gasto fijo existente (ej. "la factura del gas"), ligalo con recurring_expense_name.
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
          "Añade un gasto real. Si corresponde a un gasto fijo (gas, luz...), pasa recurring_expense_name. Si es de mascotas, pet_split=true.",
        inputSchema: z.object({
          amount: z.number().positive(),
          description: z.string().default(""),
          date: z.string().describe("YYYY-MM-DD, por defecto hoy").default(today),
          category_name: z.string().optional(),
          recurring_expense_name: z.string().optional(),
          pet_split: z.boolean().default(false),
        }),
        execute: async (input) => {
          const category = findCategory(input.category_name);
          const recurring = findRecurringExpense(input.recurring_expense_name);
          const { data, error } = await supabase
            .from("transactions")
            .insert({
              amount: input.amount,
              description: input.description,
              date: input.date,
              type: "expense",
              category_id: category?.id ?? null,
              recurring_expense_id: recurring?.id ?? null,
            })
            .select("id")
            .single();
          if (error) return { error: error.message };
          if (input.pet_split && pets.length > 0) {
            await supabase.from("transaction_pet_splits").insert(
              pets
                .map((p) => ({
                  transaction_id: data.id,
                  pet_id: p.id,
                  amount:
                    Math.round(
                      input.amount * Number(p.default_split_pct)
                    ) / 100,
                }))
                .filter((r) => r.amount > 0)
            );
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
          const { error } = await supabase.from("transactions").insert({
            amount: input.amount,
            description: input.description,
            date: input.date,
            type: "income",
            recurring_income_id: recurring?.id ?? null,
            profile_id: profile?.user_id ?? null,
            is_extraordinary: !recurring,
          });
          return error ? { error: error.message } : { ok: true };
        },
      }),

      add_recurring_expense: tool({
        description:
          "Crea un gasto fijo nuevo que se provisiona cada mes (anual/12 si period=annual).",
        inputSchema: z.object({
          name: z.string(),
          amount: z.number().positive(),
          period: z.enum(["monthly", "annual"]),
          category_name: z.string().optional(),
        }),
        execute: async (input) => {
          const category = findCategory(input.category_name);
          const { error } = await supabase.from("recurring_expenses").insert({
            name: input.name,
            amount: input.amount,
            period: input.period,
            category_id: category?.id ?? null,
            starts_on: month,
          });
          return error ? { error: error.message } : { ok: true };
        },
      }),

      update_recurring_expense: tool({
        description:
          "Cambia el importe de un gasto fijo existente. effective='next' lo aplica desde el mes que viene (recomendado), 'now' corrige la versión actual.",
        inputSchema: z.object({
          name: z.string(),
          new_amount: z.number().positive(),
          new_period: z.enum(["monthly", "annual"]).optional(),
          effective: z.enum(["next", "now"]).default("next"),
        }),
        execute: async (input) => {
          const current = findRecurringExpense(input.name);
          if (!current) return { error: `No existe el gasto fijo "${input.name}"` };
          const period = input.new_period ?? current.period;
          if (input.effective === "now") {
            const { error } = await supabase
              .from("recurring_expenses")
              .update({ amount: input.new_amount, period })
              .eq("id", current.id);
            return error ? { error: error.message } : { ok: true };
          }
          const { error: closeErr } = await supabase
            .from("recurring_expenses")
            .update({ ends_on: monthEnd(month) })
            .eq("id", current.id);
          if (closeErr) return { error: closeErr.message };
          const { error } = await supabase.from("recurring_expenses").insert({
            name: current.name,
            amount: input.new_amount,
            period,
            starts_on: addMonths(month, 1),
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
          "Resumen de un mes: ingresos, provisiones, gasto real, extras y disponible.",
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
            provisiones: b.provisions,
            gasto_real: b.realExpenses,
            gastos_extra: b.extraExpenses,
            disponible: b.available,
            cerrado: b.closed,
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
          text: z.string().optional(),
          type: z.enum(["expense", "income"]).optional(),
        }),
        execute: async (input) => {
          let q = supabase
            .from("transactions")
            .select("date, amount, type, description, category_id")
            .gte("date", input.from)
            .lte("date", input.to)
            .order("date", { ascending: false })
            .limit(100);
          const category = findCategory(input.category_name);
          if (category) q = q.eq("category_id", category.id);
          if (input.type) q = q.eq("type", input.type);
          if (input.text) q = q.ilike("description", `%${input.text}%`);
          const { data, error } = await q;
          if (error) return { error: error.message };
          const catName = new Map(categories.map((c) => [c.id, c.name]));
          return {
            total: (data ?? []).reduce((s, t) => s + Number(t.amount), 0),
            movimientos: (data ?? []).map((t) => ({
              fecha: t.date,
              importe: Number(t.amount),
              tipo: t.type,
              descripcion: t.description,
              categoria: catName.get(t.category_id ?? "") ?? null,
            })),
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
