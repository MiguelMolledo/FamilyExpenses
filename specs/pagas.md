# Pagas personales (Mi dinero)

Dinero mensual de cada miembro que NO pasa por la cuenta común: se retiene de la nómina antes de ingresarla (las nóminas se registran ya netas).

## Capacidades

- Cada miembro tiene una paga mensual configurable en Ajustes (400 €/mes por defecto en Los Molledo), con importe versionado por fechas (starts_on/ends_on) como los ingresos recurrentes.
- La paga se devenga automáticamente cada mes; el sobrante se acumula.
- La página «Mi dinero» muestra el saldo de cada miembro y sus movimientos personales: gasto, ingreso extra y ajuste (incluido «actualizar saldo» por diferencia).
- Los movimientos personales viven en su propio ledger (`personal_movements`), fuera de `transactions`: no contaminan el presupuesto familiar.

## Restricciones

- Los movimientos personales son visibles y editables por TODOS los miembros de la familia (la policy es de ámbito familia, no por perfil). Decisión pendiente si debe ser privado por miembro.
- El importe firmado: gasto negativo, extra positivo, ajuste con su signo.

## Specs relacionados

- [Presupuesto](./presupuesto.md) — las nóminas netas ya descuentan la paga

## Source

- [src/lib/paga.ts](../src/lib/paga.ts)
- [src/app/(app)/paga/page.tsx](../src/app/(app)/paga/page.tsx)
- [src/components/paga/](../src/components/paga/)
- [src/components/ajustes/personal-allowances-section.tsx](../src/components/ajustes/personal-allowances-section.tsx)
