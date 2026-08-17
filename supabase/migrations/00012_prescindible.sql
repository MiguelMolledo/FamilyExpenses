-- Prescindible: qué parte del presupuesto se podría cortar en un bache
-- (quedarse sin trabajo, un imprevisto gordo). Por defecto todo es
-- imprescindible; se marca a nivel de subcategoría, o con
-- categories.is_flexible si la categoría entera lo es. Presupuesto
-- imprescindible = mínimo para vivir; gasto real en lo prescindible =
-- capacidad de reacción del dashboard.

set search_path = family, public;

alter table subcategories
  add column prescindible boolean not null default false;
