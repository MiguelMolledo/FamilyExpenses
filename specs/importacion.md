# Importación de extractos

Importar movimientos desde extractos de CaixaBank (PDF o Excel .xls) con categorización asistida y deduplicación.

## Capacidades

- El usuario sube un PDF o Excel; el parseo es determinista y ocurre en el servidor (formato corto: Fecha/Movimiento/Importe; formato largo: solo gastos, con conceptos complementarios). Máximo 5 MB.
- En pagos con tarjeta manda la fecha real de la compra ("Fecha de operación") sobre la contable.
- Cada fila propone categoría + subcategoría: primero por reglas aprendidas (`category_rules`, patrón normalizado sin acentos/dígitos/puntuación), y solo los conceptos sin regla van a la IA (nunca importes ni fechas). Lo que el usuario confirma al importar se convierte en regla.
- Duplicados: exacto por huella fecha+importe+concepto ("ya importado", con sufijo `#n` para ocurrencias repetidas legítimas) y blando por fecha+importe+tipo con texto distinto ("posible duplicado", p. ej. el mismo recibo en el Excel corto y el largo). Los duplicados vienen desmarcados.
- El checkbox "gasto fijo" se sugiere mirando si la subcategoría ya tiene recibos fijos en el histórico reciente.
- Selección en bloque: marcar/desmarcar todo y "desmarcar N duplicados".
- El borrador sobrevive a la navegación (localStorage) hasta importar o cancelar.
- El commit valida que categoría/subcategoría pertenezcan a la familia y sean coherentes entre sí, e inserta todo el lote en un solo upsert (los duplicados residuales se ignoran por el constraint único `family_id+dedup_hash`).

## Restricciones

- El formato largo de Excel solo importa gastos.
- El parser de PDF no está validado con un PDF real todavía (el de Excel sí, 2026-08-06).
- Las descripciones que salen hacia la IA van sin tokens de 6+ dígitos (contratos, referencias).

## Specs relacionados

- [Presupuesto](./presupuesto.md) — los movimientos importados atacan al presupuesto de su categoría

## Source

- [src/lib/caixabank.ts](../src/lib/caixabank.ts)
- [src/app/api/import/parse/route.ts](../src/app/api/import/parse/route.ts)
- [src/app/api/import/commit/route.ts](../src/app/api/import/commit/route.ts)
- [src/app/(app)/importar/page.tsx](../src/app/(app)/importar/page.tsx)
