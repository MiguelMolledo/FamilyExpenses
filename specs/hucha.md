# Hucha (ahorro)

Cuenta de ahorro familiar con objetivo mensual. El objetivo descuenta del disponible del mes aunque no se haya movido el dinero todavía.

## Capacidades

- Registrar movimientos: aportación del mes (prellenada con el objetivo), aportación extra, retirada, intereses y «actualizar saldo total» (ajuste por diferencia, útil tras liquidación de intereses).
- Ver el saldo actual y el histórico de movimientos (borrables con confirmación).
- Configurar el objetivo mensual de ahorro en Ajustes (`savings_plans.monthly_target`).
- Inicio muestra el saldo, lo ahorrado en el año y la curva real vs objetivo mes a mes.
- El chat puede registrar movimientos de hucha.

## Restricciones

- Hay una única hucha por familia (se crea en el onboarding).
- Retiradas se guardan en negativo; el saldo es la suma de todos los movimientos.

## Specs relacionados

- [Presupuesto](./presupuesto.md) — el objetivo mensual descuenta del disponible

## Source

- [src/app/(app)/hucha/page.tsx](../src/app/(app)/hucha/page.tsx)
- [src/components/hucha/](../src/components/hucha/)
- [src/components/dashboard/savings-chart.tsx](../src/components/dashboard/savings-chart.tsx)
