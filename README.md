# FamilyExpenses 💶

App de gestión de gastos e ingresos familiares. Next.js + Supabase + Vercel.

## Qué hace

- **Presupuesto con provisiones anualizadas**: los gastos fijos irregulares
  (gas, gasoil, seguros…) se definen por su coste anual y la app reserva la
  cuota mensual (2.000 €/año → 166,67 €/mes). Ves lo provisionado vs lo gastado
  de verdad y la desviación acumulada del año.
- **Movimientos**: gastos e ingresos reales del mes, extras, vínculo a fijos y
  reparto de gastos entre mascotas.
- **Dashboard**: disponible este mes, gráfica anual real vs previsto, desglose
  por categoría y avisos de desviación.
- **Hucha**: ahorro con historial (aportes, retiradas, intereses) y objetivo
  mensual que cuenta como provisión.
- **Cierre de mes**: congela el mes y arrastra el sobrante/déficit.
- **Mascotas**: coste anual y media mensual por animal.
- **Asistente IA** (botón flotante): chat con voz en español (Web Speech API)
  y tool calls vía OpenRouter — «añade 45 euros de la farmacia», «¿cuánto
  llevamos en comida?», «el gas sube a 80 al mes».
- **Import PDF CaixaBank**: parser determinista local (los movimientos no
  pasan por ninguna IA), preview editable con checks y detección de
  duplicados, con aprendizaje de categorías.
- **Multi-familia**: login con usuario y contraseña; cada familia aislada con
  RLS. Únete con el código de invitación de Ajustes.

## Desarrollo

```bash
cp .env.local.example .env.local  # rellena las keys
npm install
npm run dev
```

La base de datos vive en Supabase, en el schema `family` (proyecto compartido
con otras apps). Migraciones en `supabase/migrations/`.

## Variables de entorno

| Variable | Qué es |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (solo server) |
| `OPENROUTER_API_KEY` | Key de OpenRouter para el chat IA |
| `OPENROUTER_MODEL` | Modelo del chat (por defecto `anthropic/claude-haiku-4.5`) |
