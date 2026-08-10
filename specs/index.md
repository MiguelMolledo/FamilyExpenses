# Specs Index

Referencia rápida de los sistemas de FamilyExpenses. Optimizado para búsqueda por palabras clave.

---

## [Presupuesto y sobres](./presupuesto.md)

Modelo de sobres puro, disponible del mes, presupuesto por categoría, subcategorías, gasto fijo (is_fixed), rollover acumula/a-ahorro, cierre de mes, arrastre (carryover), capacidad de reacción, ingresos recurrentes, comparar meses.

**Source**: `src/lib/budget.ts`, `src/app/(app)/presupuesto/`, `src/app/(app)/page.tsx`, `src/app/(app)/comparar/`

---

## [Importación de extractos](./importacion.md)

Import CaixaBank PDF y Excel (.xls), parser determinista, deduplicación exacta y blanda, reglas aprendidas (category_rules), sugerencias de IA, borrador en localStorage, checkbox de recibo fijo.

**Source**: `src/lib/caixabank.ts`, `src/app/api/import/`, `src/app/(app)/importar/`

---

## [Chat asistente](./chat.md)

Asistente IA flotante, OpenRouter, tools (añadir gasto/ingreso, hucha, resúmenes, búsqueda de movimientos), dictado por voz, reparto entre mascotas.

**Source**: `src/app/api/chat/route.ts`, `src/components/chat/chat-float.tsx`

---

## [Pagas personales](./pagas.md)

Paga mensual por miembro (Mi dinero), devengo automático, importe versionado, movimientos personales fuera del presupuesto familiar.

**Source**: `src/lib/paga.ts`, `src/app/(app)/paga/`, `src/components/ajustes/personal-allowances-section.tsx`

---

## [Hucha (ahorro)](./hucha.md)

Cuenta de ahorro familiar, aportaciones, retiradas, intereses, actualizar saldo, objetivo mensual de ahorro, gráfico real vs objetivo.

**Source**: `src/app/(app)/hucha/`, `src/components/hucha/`, `src/components/ajustes/savings-target-section.tsx`

---

## [Autenticación y familias](./auth-familias.md)

Usuarios con pseudo-email, crear/unirse a familia, código de invitación, RLS por familia, schema `family` compartido con GymStats, seguridad de datos.

**Source**: `src/lib/auth.ts`, `src/app/(auth)/`, `src/proxy.ts`, `supabase/migrations/`

---
