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
- Inicio muestra: disponible del mes, categorías en riesgo (>80% o pasadas), KPIs (gastado → Presupuesto, hucha, vs objetivo), a dónde van los ingresos, capacidad de reacción (gasto en categorías `is_flexible`), distribución del gasto, ahorro del año y año real vs previsto.
- Comparar meses: dos selectores sobre todo el histórico; resumen de KPIs y gasto por categoría con el presupuesto del mes B como referencia.
- Las categorías `exclude_from_stats` (Traspaso) no cuentan como ingreso ni gasto.
- Desde Inicio se puede añadir un movimiento sin cambiar de página.

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
