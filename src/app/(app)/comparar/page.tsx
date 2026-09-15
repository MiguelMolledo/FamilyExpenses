import {
  addMonths,
  getCategoryBudgets,
  getMonthBudget,
} from "@/lib/budget";
import { createClient } from "@/lib/supabase/server";
import { eur, currentMonthStart } from "@/lib/types";
import { MonthPickers } from "@/components/comparar/month-pickers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function monthLabel(month: string): string {
  return new Date(month + "T00:00:00").toLocaleDateString("es-ES", {
    month: "short",
    year: "2-digit",
  });
}

/** Delta B−A: en gastos subir es malo (rojo); en ingresos/margen, bueno. */
function Delta({ value, goodUp }: { value: number; goodUp: boolean }) {
  if (Math.abs(value) < 0.005)
    return <span className="text-xs text-muted-foreground">=</span>;
  const good = value > 0 === goodUp;
  return (
    <span
      className={cn(
        "text-xs font-medium",
        good ? "text-green-600" : "text-red-600"
      )}
    >
      {value > 0 ? "+" : "−"}
      {eur(Math.abs(value))}
    </span>
  );
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const supabase = await createClient();
  const current = currentMonthStart();
  const params = await searchParams;
  const valid = (m?: string) => (/^\d{4}-\d{2}-01$/.test(m ?? "") ? m! : null);
  const a = valid(params.a) ?? addMonths(current, -1);
  const b = valid(params.b) ?? current;

  const [firstTxQ, budgetA, budgetB, catsA, catsB] = await Promise.all([
    supabase
      .from("transactions")
      .select("date")
      .order("date")
      .limit(1)
      .maybeSingle(),
    getMonthBudget(supabase, a),
    getMonthBudget(supabase, b),
    getCategoryBudgets(supabase, a),
    getCategoryBudgets(supabase, b),
  ]);

  // Histórico completo: del primer movimiento al mes actual
  const first = (firstTxQ.data?.date ?? current).slice(0, 7) + "-01";
  const months: string[] = [];
  for (let m = current; m >= first; m = addMonths(m, -1)) months.push(m);

  const kpis = [
    {
      label: "Ingresos",
      a: budgetA.realIncome,
      b: budgetB.realIncome,
      goodUp: true,
    },
    {
      label: "Gasto total",
      a: budgetA.realExpenses,
      b: budgetB.realExpenses,
      goodUp: false,
    },
    {
      label: "En fijos",
      a: budgetA.realExpenses - budgetA.extraExpenses,
      b: budgetB.realExpenses - budgetB.extraExpenses,
      goodUp: false,
    },
    {
      label: "Variables",
      a: budgetA.extraExpenses,
      b: budgetB.extraExpenses,
      goodUp: false,
    },
    {
      label: "Margen (ingresos − gasto)",
      a: budgetA.realIncome - budgetA.realExpenses,
      b: budgetB.realIncome - budgetB.realExpenses,
      goodUp: true,
    },
  ];

  // Gasto por categoría en ambos meses (unión, ordenado por el mes B);
  // el presupuesto del mes B sirve de referencia "¿vamos bien?"
  const spentA = new Map(catsA.rows.map((r) => [r.category.id, r.spent]));
  const byId = new Map(catsB.rows.map((r) => [r.category.id, r]));
  for (const r of catsA.rows) if (!byId.has(r.category.id)) byId.set(r.category.id, r);
  const catRows = [...byId.values()]
    .map((r) => {
      const rowB = catsB.rows.find((x) => x.category.id === r.category.id);
      return {
        name: r.category.name,
        a: spentA.get(r.category.id) ?? 0,
        b: rowB?.spent ?? 0,
        budget: rowB?.budget ?? null,
      };
    })
    .filter((r) => r.a > 0.005 || r.b > 0.005)
    .sort((x, y) => y.b - x.b);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Comparar meses</h1>
      <MonthPickers months={months} a={a} b={b} />

      {/* Escritorio: resumen y categorías lado a lado */}
      <div className="flex flex-col gap-4 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] @3xl:items-start @3xl:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
          <CardDescription>
            {monthLabel(a)} frente a {monthLabel(b)}; la diferencia es de{" "}
            {monthLabel(b)} respecto a {monthLabel(a)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 pb-1 text-xs text-muted-foreground">
            <span />
            <span className="w-20 text-right capitalize">{monthLabel(a)}</span>
            <span className="w-20 text-right capitalize">{monthLabel(b)}</span>
            <span className="w-20 text-right">Diferencia</span>
          </div>
          {kpis.map((k) => (
            <div
              key={k.label}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 py-2 text-sm"
            >
              <span className="truncate">{k.label}</span>
              <span className="w-20 text-right text-muted-foreground">
                {eur(k.a)}
              </span>
              <span className="w-20 text-right font-medium">{eur(k.b)}</span>
              <span className="w-20 text-right">
                <Delta value={k.b - k.a} goodUp={k.goodUp} />
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gasto por categoría</CardTitle>
          <CardDescription>
            Bajo cada categoría, su presupuesto mensual; el gasto de{" "}
            {monthLabel(b)} va en rojo si lo supera.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {catRows.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              Sin gastos en ninguno de los dos meses.
            </p>
          )}
          {catRows.map((r) => (
            <div
              key={r.name}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate">{r.name}</span>
                {r.budget != null && (
                  <span className="block text-xs text-muted-foreground">
                    ppto {eur(r.budget)}
                  </span>
                )}
              </span>
              <span className="w-20 text-right text-muted-foreground">
                {eur(r.a)}
              </span>
              <span
                className={cn(
                  "w-20 text-right font-medium",
                  r.budget != null && r.b > r.budget && "text-red-600"
                )}
              >
                {eur(r.b)}
              </span>
              <span className="w-20 text-right">
                <Delta value={r.b - r.a} goodUp={false} />
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
