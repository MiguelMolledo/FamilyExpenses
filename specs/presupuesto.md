# Presupuesto y sobres

Modelo de sobres puro: nada se provisiona por adelantado; solo el gasto real ataca al dinero del mes. El presupuesto por categoría es la referencia de lo previsto.

## Capacidades

- El disponible del mes = ingresos reales − gasto real − objetivo de ahorro + arrastre del mes anterior.
- Los ingresos recurrentes (nóminas, rentas) cuentan por su importe previsto hasta que llega el movimiento vinculado; entonces manda el importe real.
- Cada categoría tiene un presupuesto mensual (`monthly_budget`), con desglose opcional por subcategoría (si la categoría no tiene importe, vale la suma de sus subcategorías). Se puede teclear en €/mes o €/año (÷12 al guardar; siempre se almacena mensual).
- TODO gasto descuenta del presupuesto de su categoría, sea fijo o variable. `is_fixed` solo etiqueta "recibo previsto" (hipoteca, seguro…) para seguimiento.
- Sobrante por categoría (`rollover`): "acumula" arrastra el saldo no gastado del año (así el IBI o un seguro anual caben en su mes); "a ahorro" parte de cero cada mes.
- Cierre de mes: al cerrar, el disponible se guarda como arrastre del mes siguiente (`month_closures`, con snapshot). Un mes cerrado se puede reabrir.
- Se puede navegar a meses pasados en Presupuesto (`?mes=`) para cerrarlos tarde; Inicio y Presupuesto avisan si el mes anterior quedó sin cerrar (su arrastre sería 0).
- Inicio muestra: disponible del mes, categorías en riesgo (>80% o pasadas), KPIs (gastado → Presupuesto, hucha, vs objetivo), a dónde van los ingresos, capacidad de reacción (gasto en lo prescindible), distribución del gasto, ahorro del año y año real vs previsto.
- Prescindible: se puede marcar una categoría entera (`is_flexible`) o subcategorías sueltas (tijeras en el desglose) como recortables en un bache; el recorte por subcategoría puede ser parcial (`prescindible_pct`: 100 = entera, 50 = la mitad — la calefacción no se quita, pero se baja). Alimenta dos vistas: capacidad de reacción (× gasto real, en Inicio) y «Modo supervivencia» en Presupuesto (× presupuesto): el plan completo del mes = categorías + ahorro + pagas personales (sobres); en supervivencia se corta lo prescindible y se pausan ahorro y pagas (prescindibles por definición), y queda el mínimo para vivir, con la lista de lo que se cortaría y el colchón — cuántos meses daría la hucha en modo mínimo sin ingresos. Solo resta lo prescindible con importe asignado en el desglose; lo sin asignar es imprescindible (con aviso).
- Comparar meses: dos selectores sobre todo el histórico; resumen de KPIs y gasto por categoría con el presupuesto del mes B como referencia.
- Las categorías `exclude_from_stats` (Traspaso) no cuentan como ingreso ni gasto.
- Desde Inicio se puede añadir un movimiento sin cambiar de página.
- El desglose por subcategorías nunca suma más que el total de su categoría (el total sube solo si el desglose lo supera); si se queda corto, aviso «te quedan X por asignar».
- Movimientos automáticos (Ajustes): gastos reales mensuales que no pasan por la cuenta común (p.ej. la derrama que paga un miembro aparte) se materializan solos el día 1 como gasto fijo; el ingreso previsto correspondiente se registra por el importe completo. Si se borra el generado de un mes, no reaparece; los meses cerrados no se tocan.
- En los gráficos de Inicio (distribución, ingresos, capacidad de reacción), pasar el ratón o tocar una categoría muestra su desglose por subcategoría.

## Restricciones

- El arrastre solo existe si el mes anterior se cerró; sin cierre es 0 (con aviso en la UI).
- El acumulado anual de una categoría "acumula" se calcula con el presupuesto actual para todos los meses del año: cambiar el presupuesto a mitad de año recalcula retroactivamente (limitación conocida).
- Las fechas "hoy" y "mes actual" se calculan en Europe/Madrid (el servidor corre en UTC).

## Specs relacionados

- [Importación](./importacion.md) — de dónde sale la mayoría del gasto real
- [Hucha](./hucha.md) — el objetivo de ahorro que descuenta del disponible

## Source

- [src/lib/budget.ts](../src/lib/budget.ts)
- [src/app/(app)/presupuesto/page.tsx](../src/app/(app)/presupuesto/page.tsx)
- [src/components/presupuesto/](../src/components/presupuesto/)
- [src/app/(app)/page.tsx](../src/app/(app)/page.tsx)
- [src/app/(app)/comparar/page.tsx](../src/app/(app)/comparar/page.tsx)
