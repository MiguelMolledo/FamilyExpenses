-- Movimientos automáticos: gastos reales y mensuales que nunca pasan por la
-- cuenta común (p.ej. la derrama del piso, que paga Blanca aparte y por eso
-- ingresa menos). Cada mes se materializan solos como una transacción normal
-- (día 1, marcada como fijo), así el presupuesto refleja el gasto real aunque
-- el banco no lo vea. La contrapartida: el ingreso previsto correspondiente
-- se registra por el importe completo.
--
-- auto_movement_runs marca qué meses ya se generaron (idempotencia): si el
-- usuario borra el movimiento generado de un mes, la marca queda y NO vuelve
-- a aparecer. Los meses cerrados no se tocan.

set search_path = family, public;

create table auto_movements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade
    default current_family_id(),
  name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  category_id uuid references categories (id) on delete set null,
  subcategory_id uuid references subcategories (id) on delete set null,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table auto_movement_runs (
  auto_movement_id uuid not null references auto_movements (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade
    default current_family_id(),
  month date not null, -- siempre día 1
  transaction_id uuid references transactions (id) on delete set null,
  primary key (auto_movement_id, month)
);

alter table transactions
  add column auto_movement_id uuid references auto_movements (id) on delete set null;
create index transactions_auto_movement_idx on transactions (auto_movement_id);

alter table auto_movements enable row level security;
alter table auto_movement_runs enable row level security;

create policy "family scope" on auto_movements
  for all using (family_id = (select current_family_id()))
  with check (family_id = (select current_family_id()));
create policy "family scope" on auto_movement_runs
  for all using (family_id = (select current_family_id()))
  with check (family_id = (select current_family_id()));
