-- Subcategorías y presupuesto por categoría.
-- El movimiento se asigna a categoría + subcategoría; el tipo (gasto/ingreso)
-- pasa a vivir en la subcategoría (una categoría puede tener ambos, p.ej.
-- Trabajo: Ingresos + Gestoría). El presupuesto se define a nivel de categoría
-- y, opcionalmente, como desglose por subcategoría. Todo gasto descuenta del
-- presupuesto de su categoría; el flag is_fixed solo marca si es un recibo
-- previsto (seguimiento de fijos), no si ataca al presupuesto.

set search_path = family, public;

create table subcategories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade
    default current_family_id(),
  category_id uuid not null references categories (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  monthly_budget numeric(12, 2) check (monthly_budget >= 0),
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

alter table categories
  add column monthly_budget numeric(12, 2) check (monthly_budget >= 0),
  -- sobrante al cerrar el mes: acumula en la categoría o se barre a ahorro
  add column rollover text not null default 'accumulate'
    check (rollover in ('accumulate', 'to_savings')),
  -- recortable: cuenta para la "capacidad de reacción" del dashboard
  add column is_flexible boolean not null default false,
  -- Traspaso: mover dinero entre cuentas propias no es gastar
  add column exclude_from_stats boolean not null default false;

-- Las categorías nuevas son contenedores neutros (el kind vive en la subcat)
alter table categories alter column kind drop not null;
create unique index categories_neutral_name_idx
  on categories (family_id, name) where kind is null;

alter table transactions
  add column subcategory_id uuid references subcategories (id) on delete set null,
  add column is_fixed boolean not null default false;

-- Histórico: lo ligado a un fijo era, por definición, un recibo previsto
update transactions set is_fixed = true where recurring_expense_id is not null;

alter table recurring_expenses
  add column subcategory_id uuid references subcategories (id) on delete set null;

-- Las reglas aprendidas del import apuntan también a la subcategoría
alter table category_rules
  add column subcategory_id uuid references subcategories (id) on delete set null;

alter table subcategories enable row level security;
create policy "family scope" on subcategories
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

grant all on subcategories to anon, authenticated, service_role;
